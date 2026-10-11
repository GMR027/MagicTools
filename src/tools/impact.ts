import * as path from "node:path";
import * as vscode from "vscode";
import { cfg } from "../config";
import { impactRequest, resolveLanguage } from "../core/prompts";
import { aiDocument, type Ctx } from "./ai";
import { resolveTarget, type FnNodeArg } from "./target";

const TEST_GLOB = "**/{test,tests,__tests__,spec}/**/*.*";
const TEST_FILE = "**/*.{test,spec}.*";
const EXCLUDE = "**/{node_modules,.git,dist,build,out,vendor,venv,.venv,coverage}/**";
const MAX_CALLERS = 30;

/** Quién llama a la función: servidor del lenguaje y, si no hay, búsqueda del nombre en el proyecto. */
async function callersOf(uri: vscode.Uri, name: string, line: number): Promise<string[]> {
  const rel = (u: vscode.Uri) => vscode.workspace.asRelativePath(u, false);
  try {
    const [item] = (await vscode.commands.executeCommand<vscode.CallHierarchyItem[] | undefined>("vscode.prepareCallHierarchy", uri, new vscode.Position(line, 0))) ?? [];
    if (item) {
      const calls = (await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[] | undefined>("vscode.provideIncomingCalls", item)) ?? [];
      if (calls.length) return calls.slice(0, MAX_CALLERS).map((c) => `${c.from.name} (${rel(c.from.uri)}:${c.from.selectionRange.start.line + 1})`);
    }
  } catch {
    // sin servidor: búsqueda por texto
  }
  return textCallers(name, uri);
}

async function textCallers(name: string, self: vscode.Uri): Promise<string[]> {
  if (!/^[\w$]+$/.test(name)) return [];
  const re = new RegExp(String.raw`(?<![\w$.])${name.replace(/\$/g, "\\$")}\s*\(`);
  const files = await vscode.workspace.findFiles("**/*.{js,jsx,ts,tsx,py,php,java,cs,go,rs,rb,kt,swift,c,cpp,vue,svelte}", EXCLUDE, 800);
  const out: string[] = [];
  for (const f of files) {
    if (out.length >= MAX_CALLERS) break;
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(f).then((b) => b, () => new Uint8Array()));
    text.split(/\r?\n/).forEach((l, i) => {
      if (out.length < MAX_CALLERS && re.test(l) && !(f.toString() === self.toString() && /\b(?:function|def|fn|func)\b/.test(l))) out.push(`${vscode.workspace.asRelativePath(f, false)}:${i + 1}  ${l.trim().slice(0, 100)}`);
    });
  }
  return out;
}

/** Archivos de test que mencionan la función. */
async function testsFor(name: string): Promise<string[]> {
  const found = new Map<string, vscode.Uri>();
  for (const glob of [TEST_GLOB, TEST_FILE]) for (const u of await vscode.workspace.findFiles(glob, EXCLUDE, 300)) found.set(u.toString(), u);
  const out: string[] = [];
  for (const u of found.values()) {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(u).then((b) => b, () => new Uint8Array()));
    if (text.includes(name)) out.push(vscode.workspace.asRelativePath(u, false));
  }
  return out.slice(0, 15);
}

/** «Simulador de impacto»: qué dependería de esta función y qué pasaría si se cambia. */
export async function simulateImpact(ctx: Ctx, arg?: FnNodeArg): Promise<void> {
  const t = await resolveTarget(arg);
  if (!t) return;
  const [callers, tests] = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `MagicTools: buscando quién usa «${t.name}»…` }, () =>
    Promise.all([callersOf(t.uri, t.name, t.start), testsFor(t.name)]),
  );
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  const intro = `\`${t.file}:${t.start + 1}\` · ${callers.length} uso(s) encontrado(s) · ${tests.length} archivo(s) de test`;
  await aiDocument(ctx, impactRequest(t.code, t.name, callers, tests, lang), "evaluando el impacto", `Impacto de cambiar ${path.basename(t.name)}`, intro);
}

import * as vscode from "vscode";
import { cfg } from "../config";
import { applyCode } from "../core/apply";
import { cleanReply, complexityRequest, firstCodeBlock, resolveLanguage, splitFunctionRequest } from "../core/prompts";
import { LIMITS, measure, removeDebugLines } from "../core/smells";
import { openReply, recordReply } from "../history";
import type { ChatRequest } from "../core/types";
import { chatBackend, runChat } from "../runChat";
import type { Ctx } from "./ai";
import { pickEditor } from "./functionTree";
import { proposeEdit } from "./propose";
import { resolveTarget, type FnNodeArg, type FnTarget } from "./target";

/** «Limpiar archivo»: quita console.log/debugger/print de una línea del archivo activo, con diff para confirmar. */
export async function cleanFile(): Promise<void> {
  const doc = pickEditor()?.document;
  if (!doc || doc.uri.scheme !== "file") return void vscode.window.showInformationMessage("MagicTools: abre el archivo que quieres limpiar.");
  const text = doc.getText();
  const { text: cleaned, removed } = removeDebugLines(text, doc.languageId, vscode.workspace.asRelativePath(doc.uri, false));
  if (!removed) return void vscode.window.showInformationMessage("MagicTools: no encontré console.log, debugger ni print() sueltos en este archivo.");
  const all = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));
  await proposeEdit(doc, cleaned, all, cleaned, `¿Quitar ${removed} línea(s) de depuración?`);
}

interface RewriteOptions {
  what: string;
  title: (name: string) => string;
  question: (name: string) => string;
  request: (t: FnTarget, lang: string) => ChatRequest;
  /** Si la respuesta puede no traer código (p. ej. «ya es óptima»), se muestra el texto en vez de avisar. */
  codeOptional?: boolean;
}

/** Pide a la IA una nueva versión de la función, la compara con el diff nativo y la aplica si aceptas. */
async function rewriteFunction(ctx: Ctx, arg: FnNodeArg | undefined, o: RewriteOptions, check?: (t: FnTarget) => Promise<boolean>): Promise<void> {
  const t = await resolveTarget(arg);
  if (!t || (check && !(await check(t)))) return;
  const backend = await chatBackend(ctx.secrets);
  if (!backend) return;
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  const raw = await runChat(backend, o.request(t, lang), o.what, ctx.log);
  const reply = raw ? cleanReply(raw) : "";
  if (!reply) {
    if (raw !== undefined) void vscode.window.showWarningMessage("MagicTools: el modelo no devolvió ninguna respuesta.");
    return;
  }
  const title = o.title(t.name);
  const intro = `\`${t.file}:${t.start + 1}\``;
  recordReply(title, intro, reply);
  const code = firstCodeBlock(reply);
  if (!code) {
    if (!o.codeOptional) void vscode.window.showWarningMessage("MagicTools: el modelo no devolvió código que aplicar.");
    return openReply(title, intro, reply);
  }
  const doc = await vscode.workspace.openTextDocument(t.uri);
  // Lo que el modelo propone sustituye exactamente a la función; el resto del archivo no se toca.
  const next = applyCode(doc.getText(), doc.offsetAt(t.range.start), doc.offsetAt(t.range.end), code);
  const applied = await proposeEdit(doc, next, t.range, code, o.question(t.name));
  if (!applied) await openReply(title, intro, reply);
}

/** «Dividir esta función»: la IA propone partirla en funciones más pequeñas y tú la comparas antes de aplicar. */
export function splitFunction(ctx: Ctx, arg?: FnNodeArg): Promise<void> {
  return rewriteFunction(
    ctx,
    arg,
    {
      what: "dividiendo la función",
      title: (n) => `Dividir ${n}`,
      question: (n) => `¿Reemplazar «${n}» por la versión dividida?`,
      request: (t, lang) => splitFunctionRequest(t.code, t.name, t.language, lang),
    },
    async (t) => {
      const m = measure(t.code);
      if (m.lines > LIMITS.lines || m.complexity >= LIMITS.complexity) return true;
      return (await vscode.window.showInformationMessage(`MagicTools: «${t.name}» no es larga (${m.lines} líneas, complejidad ${m.complexity}). ¿La divido igualmente?`, "Dividir", "Cancelar")) === "Dividir";
    },
  );
}

/** «Complejidad Big-O»: estima el coste, señala el cuello de botella y propone una versión optimizada con diff. */
export function analyzeComplexity(ctx: Ctx, arg?: FnNodeArg): Promise<void> {
  return rewriteFunction(ctx, arg, {
    what: "analizando la complejidad",
    title: (n) => `Complejidad de ${n}`,
    question: (n) => `¿Reemplazar «${n}» por la versión optimizada?`,
    request: (t, lang) => complexityRequest(t.code, t.name, t.language, lang),
    codeOptional: true,
  });
}

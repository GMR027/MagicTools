import * as vscode from "vscode";
import * as path from "node:path";
import { cfg } from "../config";
import { buildDepGraph, depsMarkdown } from "../core/deps";
import { fileComplexity, hotspotsMarkdown, parseNumstat, rankHotspots } from "../core/hotspots";
import { resolveLanguage, reviewRequest, securityRequest } from "../core/prompts";
import { openReply } from "../history";
import { aiDocument, type Ctx } from "./ai";
import { git, repoRoot } from "./diffTool";
import { readProject } from "./projectTools";
import { resolveTarget, type FnNodeArg } from "./target";
import { projectRoot } from "./workspace";

/** «Revisión de código»: la IA como revisor estricto de un PR ajeno, con hallazgos por severidad. */
export async function reviewCode(ctx: Ctx, arg?: FnNodeArg): Promise<void> {
  const t = await resolveTarget(arg);
  if (!t) return;
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  await aiDocument(ctx, reviewRequest(t.code, t.name, t.language, lang), "revisando el código", `Revisión de ${t.name}`, `\`${t.file}:${t.start + 1}\``);
}

/** «Revisor de seguridad»: vulnerabilidades tipo OWASP en la función o selección. */
export async function securityReview(ctx: Ctx, arg?: FnNodeArg): Promise<void> {
  const t = await resolveTarget(arg);
  if (!t) return;
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  await aiDocument(ctx, securityRequest(t.code, t.name, t.language, lang), "revisando la seguridad", `Seguridad de ${t.name}`, `\`${t.file}:${t.start + 1}\``);
}

/** «Mapa de dependencias»: imports entre archivos, dependencias circulares y diagrama Mermaid. Sin IA. */
export async function dependencyMap(): Promise<void> {
  const project = await readProject();
  if (!project) return;
  const g = buildDepGraph(project.files);
  if (!g.edges.size) return void vscode.window.showInformationMessage("MagicTools: no encontré archivos de JavaScript, TypeScript o Python en el proyecto.");
  const text = depsMarkdown(g) + (project.truncated ? "\n\n_Solo se revisaron los primeros archivos; el proyecto es más grande._" : "");
  const name = path.basename(projectRoot()!.fsPath);
  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: `# Dependencias de ${name}\n\n_Calculado en tu equipo, sin IA._\n\n${text}\n` });
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  // La vista previa de Markdown de VS Code no dibuja Mermaid sin una extensión; el texto con los ciclos se lee igual.
}

const HOTSPOT_MONTHS = 12;
const CODE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|php|c|cpp|cs|rb)$/i;

/** «Hotspots de Git»: archivos que cambian mucho y son complejos. Sin IA. */
export async function gitHotspots(): Promise<void> {
  const root = await repoRoot();
  if (!root) return void vscode.window.showInformationMessage("MagicTools: abre una carpeta que sea un repositorio Git.");
  let log: string;
  try {
    log = await git(root, ["log", `--since=${HOTSPOT_MONTHS} months ago`, "--no-merges", "--numstat", "--format="]);
  } catch (err) {
    return void vscode.window.showWarningMessage(`MagicTools: no pude leer el historial de Git (${(err as Error).message}).`);
  }
  const changes = parseNumstat(log);
  const complexity = new Map<string, number>();
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "MagicTools: calculando hotspots…" }, async () => {
    const busiest = [...changes].filter(([p, c]) => c.commits >= 2 && CODE_FILE.test(p)).sort((a, b) => b[1].commits - a[1].commits).slice(0, 300);
    for (const [rel] of busiest) {
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(root, rel)));
        if (bytes.byteLength > 300_000) continue;
        complexity.set(rel, fileComplexity(new TextDecoder().decode(bytes), rel.slice(rel.lastIndexOf(".") + 1).toLowerCase()));
      } catch {
        // el archivo ya no existe (borrado o movido): no cuenta
      }
    }
  });
  await openReply(`Hotspots de ${path.basename(root)}`, "", hotspotsMarkdown(rankHotspots(changes, complexity), HOTSPOT_MONTHS));
}

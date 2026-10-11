import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { addedFileDiff, BASE_BRANCHES } from "../core/diff";
import { cfg } from "../config";
import { diffRequest, resolveLanguage } from "../core/prompts";
import { aiDocument, type Ctx } from "./ai";

const execFileAsync = promisify(execFile);

/** Ejecuta git (sin shell) en la carpeta del repositorio. */
export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  return stdout;
}

/** Raíz del repositorio: la que conoce la extensión Git de VS Code o, si no, la carpeta del proyecto. */
export async function repoRoot(): Promise<string | undefined> {
  const file = vscode.window.activeTextEditor?.document.uri;
  const folder = (file && vscode.workspace.getWorkspaceFolder(file)) ?? vscode.workspace.workspaceFolders?.[0];
  const start = file?.scheme === "file" ? path.dirname(file.fsPath) : folder?.uri.fsPath;
  if (!start) return undefined;
  try {
    return (await git(start, ["rev-parse", "--show-toplevel"])).trim() || undefined;
  } catch {
    return undefined;
  }
}

const SOURCES = [
  { label: "Mis cambios sin commitear", detail: "Lo que has modificado o creado desde el último commit", id: "head" },
  { label: "Mi rama contra main", detail: "Todo lo que llevaría tu Pull Request", id: "branch" },
  { label: "Solo lo preparado (staged)", detail: "Lo que entraría en el próximo commit", id: "staged" },
  { label: "El último commit", detail: "Qué cambió el commit más reciente", id: "last" },
  { label: "Pegar un diff del portapapeles", detail: "Por ejemplo, el diff de un PR de GitHub", id: "clip" },
] as const;

type SourceId = (typeof SOURCES)[number]["id"];

const SKIP_NEW = /(^|\/)(node_modules|dist|out|build|\.git)\/|\.(png|jpe?g|gif|webp|ico|pdf|zip|vsix|lock)$/i;

/** Archivos nuevos (sin rastrear, respetando .gitignore) como diff, para que «mis cambios» también los incluya. */
async function untrackedDiff(root: string): Promise<string> {
  const names = (await git(root, ["ls-files", "--others", "--exclude-standard"])).split("\n").filter((n) => n && !SKIP_NEW.test(n));
  let out = "";
  for (const name of names.slice(0, 20)) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(root, name)));
      if (bytes.byteLength <= 200_000) out += addedFileDiff(name, new TextDecoder().decode(bytes));
    } catch {
      // ilegible: se omite
    }
  }
  return out;
}

async function hasHead(root: string): Promise<boolean> {
  return git(root, ["rev-parse", "--verify", "HEAD"]).then(() => true, () => false);
}

/** Diff de la opción elegida (o un texto vacío si no hay nada que explicar). */
export async function collectDiff(root: string, id: Exclude<SourceId, "clip">): Promise<string> {
  const head = await hasHead(root);
  switch (id) {
    case "head":
      // Sin ningún commit todavía, «sin commitear» es todo lo preparado más lo nuevo.
      return (head ? await git(root, ["diff", "HEAD"]) : await git(root, ["diff", "--cached"])) + (await untrackedDiff(root));
    case "staged":
      return git(root, ["diff", "--cached"]);
    case "last":
      // `show` también funciona con el primer commit (se compara contra «nada»).
      return head ? git(root, ["show", "--format=", "--patch", "HEAD"]) : "";
    case "branch":
      for (const base of BASE_BRANCHES) {
        const d = await git(root, ["diff", `${base}...HEAD`]).catch(() => "");
        if (d.trim()) return d;
      }
      return "";
  }
}

const EMPTY_MESSAGE: Record<Exclude<SourceId, "clip">, string> = {
  head: "No tienes cambios sin commitear. Modifica o crea un archivo, o prueba «El último commit».",
  staged: "No hay nada preparado (staged). Usa «+» en Control de código fuente o elige «Mis cambios sin commitear».",
  last: "No pude leer el último commit de este repositorio.",
  branch: "No hay diferencias con main (¿estás en main, o no existe esa rama?). Prueba «El último commit».",
};

/** «Explica este diff/PR»: resumen, riesgos y checklist; pegable en la descripción del PR. */
export async function explainDiff(ctx: Ctx): Promise<void> {
  const pick = await vscode.window.showQuickPick([...SOURCES], { title: "MagicTools — ¿qué cambios explico?", placeHolder: "Elige de dónde tomar los cambios" });
  if (!pick) return;
  let diff = "";
  try {
    if (pick.id === "clip") diff = await vscode.env.clipboard.readText();
    else {
      const root = await repoRoot();
      if (!root) return void vscode.window.showInformationMessage("MagicTools: abre una carpeta que sea un repositorio Git (o elige «Pegar un diff del portapapeles»).");
      diff = await collectDiff(root, pick.id);
    }
  } catch (err) {
    return void vscode.window.showWarningMessage(`MagicTools: no pude obtener el diff (${(err as Error).message}).`);
  }
  if (!diff.trim()) {
    return void vscode.window.showInformationMessage(`MagicTools: ${pick.id === "clip" ? "el portapapeles no tiene ningún diff." : EMPTY_MESSAGE[pick.id]}`);
  }
  if (pick.id === "clip" && !/^(diff --git|---|@@|\+\+\+)/m.test(diff)) {
    return void vscode.window.showInformationMessage("MagicTools: lo que hay en el portapapeles no parece un diff (debería tener líneas con «@@» o «diff --git»).");
  }
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  await aiDocument(ctx, diffRequest(diff, lang), "explicando los cambios", "Explicación de los cambios", `_${pick.label} · ${diff.split("\n").length} líneas de diff_`);
}

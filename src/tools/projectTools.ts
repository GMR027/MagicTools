import * as vscode from "vscode";
import * as path from "node:path";
import { summarize, summaryMarkdown, type SummaryFile } from "../core/projectSummary";
import { envEntries, envExampleBlock, isScannable, scanSecrets } from "../core/secrets";
import { openReply } from "../history";
import { projectRoot } from "./workspace";

const EXCLUDE = "**/{node_modules,.git,dist,build,out,vendor,venv,.venv,coverage,__pycache__,.next}/**";
const MAX_FILES = 1500;
const MAX_BYTES = 300_000;
const BINARY = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock)$|\.(?:lock|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|vsix|map|min\.js|mp[34]|mov|exe|dll|so|class|jar)$/i;

/** Lee los archivos de texto del proyecto (con tope de cantidad y tamaño). */
export async function readProject(): Promise<{ files: SummaryFile[]; truncated: boolean } | undefined> {
  const root = projectRoot();
  if (!root) {
    void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto primero.");
    return undefined;
  }
  const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(root, "**/*"), EXCLUDE, MAX_FILES + 1);
  const files: SummaryFile[] = [];
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "MagicTools: leyendo el proyecto…" }, async () => {
    for (const uri of uris.slice(0, MAX_FILES)) {
      const rel = vscode.workspace.asRelativePath(uri, false);
      if (BINARY.test(rel)) continue;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > MAX_BYTES || bytes.includes(0)) continue;
        files.push({ path: rel, text: new TextDecoder().decode(bytes) });
      } catch {
        // ilegible: se omite
      }
    }
  });
  return { files, truncated: uris.length > MAX_FILES };
}

/** «Resumen del proyecto»: números del proyecto sin IA, en un documento Markdown. */
export async function projectSummary(): Promise<void> {
  const project = await readProject();
  if (!project) return;
  const name = path.basename(projectRoot()!.fsPath);
  await openReply(`Resumen de ${name}`, "_Calculado en tu equipo, sin IA._", summaryMarkdown(summarize(project.files), project.truncated));
}

/** «Crear .env.example»: un nombre de variable por cada secreto hallado, sin ningún valor real. Nunca borra lo que ya hay. */
export async function createEnvExample(): Promise<void> {
  const root = projectRoot();
  const project = await readProject();
  if (!root || !project) return;
  const found = project.files.filter((f) => isScannable(f.path)).map((f) => ({ file: f.path, hits: scanSecrets(f.text) })).filter((f) => f.hits.length);
  if (!found.length) return void vscode.window.showInformationMessage("MagicTools: no encontré secretos, así que no hay nada que poner en un .env.example.");
  const target = vscode.Uri.joinPath(root, ".env.example");
  const existing = await vscode.workspace.fs.readFile(target).then((b) => new TextDecoder().decode(b), () => undefined);
  const block = envExampleBlock(envEntries(found), existing ?? "");
  if (!block) return void vscode.window.showInformationMessage("MagicTools: el .env.example ya tiene todas esas variables.");
  const total = found.reduce((n, f) => n + f.hits.length, 0);
  const ok = await vscode.window.showInformationMessage(
    `MagicTools: ${total} secreto(s) en ${found.length} archivo(s). ¿${existing === undefined ? "Crear" : "Añadir a"} .env.example con los nombres de las variables (sin valores)?`,
    "Sí",
    "Cancelar",
  );
  if (ok !== "Sí") return;
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(`${existing ?? ""}${sep}${block}`));
  await vscode.window.showTextDocument(target);
  void vscode.window.showInformationMessage("MagicTools: listo. Recuerda mover los valores reales a un .env (fuera de Git) y rotar las claves que ya estaban en el código.");
}

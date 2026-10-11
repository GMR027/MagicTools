import * as vscode from "vscode";
import { pickEditor } from "./functionTree";

/** Carpeta del proyecto: la del archivo activo o la primera abierta. */
export function projectRoot(): vscode.Uri | undefined {
  const doc = pickEditor()?.document.uri;
  return (doc && vscode.workspace.getWorkspaceFolder(doc)?.uri) ?? vscode.workspace.workspaceFolders?.[0]?.uri;
}

/** Abre un archivo del proyecto; si no existe, lo crea con la plantilla (tras avisar). */
export async function openOrCreate(rel: string, template: string, what: string): Promise<vscode.Uri | undefined> {
  const root = projectRoot();
  if (!root) {
    void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto primero.");
    return undefined;
  }
  const uri = vscode.Uri.joinPath(root, rel);
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    const ok = await vscode.window.showInformationMessage(`MagicTools: todavía no existe ${rel}. ¿Crear ${what} con una plantilla?`, "Crear", "Cancelar");
    if (ok !== "Crear") return undefined;
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(template));
  }
  await vscode.window.showTextDocument(uri);
  return uri;
}

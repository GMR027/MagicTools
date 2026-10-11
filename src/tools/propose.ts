import * as vscode from "vscode";

/** Documentos virtuales con el código propuesto, para compararlo con el diff nativo antes de aplicarlo. */
export const PROPOSED_SCHEME = "magictools-proposed";
const proposed = new Map<string, string>();
export const proposedProvider: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent: (uri) => proposed.get(uri.path) ?? "",
};

/**
 * Muestra el diff nativo entre el documento y `newText` y pregunta si aplicarlo.
 * Si se acepta, reemplaza `range` por `replacement`. Devuelve true si se aplicó.
 */
export async function proposeEdit(doc: vscode.TextDocument, newText: string, range: vscode.Range, replacement: string, question: string): Promise<boolean> {
  const key = `/${Date.now()}/${doc.uri.path.split("/").pop()}`;
  proposed.set(key, newText);
  const right = vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: key });
  try {
    await vscode.commands.executeCommand("vscode.diff", doc.uri, right, `MagicTools: cambios propuestos en ${vscode.workspace.asRelativePath(doc.uri)}`, { preview: true });
    const pick = await vscode.window.showInformationMessage(question, "Aplicar", "Descartar");
    if (pick !== "Aplicar") return false;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, range, replacement);
    if (!(await vscode.workspace.applyEdit(edit))) return false;
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(range.start, range.start) });
    return true;
  } finally {
    proposed.delete(key);
  }
}

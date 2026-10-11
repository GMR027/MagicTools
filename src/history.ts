import * as vscode from "vscode";
import { HISTORY_KEY, pushHistory, sanitizeHistory, type HistoryEntry } from "./core/history";
import { findRefs, LINKS_MARK } from "./core/checklist";

let store: vscode.Memento | undefined;

export function initHistory(memento: vscode.Memento): void {
  store = memento;
}

const read = (): HistoryEntry[] => sanitizeHistory(store?.get(HISTORY_KEY));

/** Guarda una respuesta de la IA (la última de cada herramienta) en el espacio de trabajo. */
export function recordReply(title: string, intro: string, text: string): void {
  void store?.update(HISTORY_KEY, pushHistory(read(), { title, intro, text, at: Date.now() }));
}

/** Abre un documento Markdown con una respuesta (con los enlaces archivo:línea activos). */
export async function openReply(title: string, intro: string, text: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: `# ${title}\n\n${intro ? `${intro}\n\n` : ""}${text}\n\n${LINKS_MARK}\n` });
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
}

/** «Ver la última respuesta»: elige una de las guardadas y se abre de nuevo, sin llamar a la IA. */
export async function showLastReply(): Promise<void> {
  const list = read();
  if (!list.length) return void vscode.window.showInformationMessage("MagicTools: todavía no hay respuestas guardadas en este proyecto.");
  const pick = await vscode.window.showQuickPick(
    list.map((e) => ({ label: e.title, description: new Date(e.at).toLocaleString(), detail: e.intro || undefined, entry: e })),
    { title: "MagicTools — respuestas guardadas", placeHolder: "Se abre de nuevo sin gastar tokens" },
  );
  if (pick) await openReply(pick.entry.title, pick.entry.intro, pick.entry.text);
}

/** Enlaces `archivo:línea` de las respuestas de MagicTools: abren el archivo en esa línea. */
export class ReplyLinks implements vscode.DocumentLinkProvider {
  provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
    if (doc.languageId !== "markdown" || !doc.getText().includes(LINKS_MARK)) return [];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return [];
    return findRefs(doc.getText()).map((r) => {
      const link = new vscode.DocumentLink(new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end)), vscode.Uri.joinPath(root, ...r.path.split("/")).with({ fragment: `L${r.line}` }));
      link.tooltip = `Abrir ${r.path} en la línea ${r.line}`;
      return link;
    });
  }
}

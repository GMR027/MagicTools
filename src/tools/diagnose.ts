import * as vscode from "vscode";
import { cfg } from "../config";
import { CONTEXT_RADIUS, contextSnippet, diagnosticText, pickDiagnostic, type DiagnosticInfo } from "../core/diagnostics";
import { cleanReply, errorRequest, resolveLanguage } from "../core/prompts";
import { chatBackend, runChat } from "../runChat";
import { pickEditor } from "./functionTree";

type Found = { uri: vscode.Uri; diag: vscode.Diagnostic };

/** Un error de VS Code (nada de warnings ni hints) como se manda a la IA. */
function describe(doc: vscode.TextDocument, d: vscode.Diagnostic): DiagnosticInfo {
  const code = typeof d.code === "object" ? String(d.code.value) : d.code === undefined ? undefined : String(d.code);
  return {
    message: d.message,
    line: d.range.start.line,
    file: vscode.workspace.asRelativePath(doc.uri),
    language: doc.languageId,
    source: d.source,
    code,
  };
}

function findAtCursor(): Found | undefined {
  const editor = pickEditor();
  if (!editor) return undefined;
  const errors = vscode.languages.getDiagnostics(editor.document.uri).filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
  const best = pickDiagnostic(errors.map((diag) => ({ line: diag.range.start.line, diag })), editor.selection.active.line);
  return best && { uri: editor.document.uri, diag: best.diag };
}

/** Explica un error del editor con su línea y el código de alrededor; el resultado se abre en un documento Markdown. */
export async function explainDiagnostic(secrets: vscode.SecretStorage, log: vscode.LogOutputChannel, found?: Found): Promise<void> {
  const target = found ?? findAtCursor();
  if (!target) {
    void vscode.window.showInformationMessage("MagicTools: no hay ningún error marcado en el archivo activo. ¡Buen trabajo!");
    return;
  }
  const doc = await vscode.workspace.openTextDocument(target.uri);
  const info = describe(doc, target.diag);
  const lines = doc.getText().split(/\r?\n/);
  const backend = await chatBackend(secrets);
  if (!backend) return;
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  const req = errorRequest(diagnosticText(info), contextSnippet(lines, info.line, CONTEXT_RADIUS), lang, true);
  const raw = await runChat(backend, req, "explicando el error", log);
  const text = raw ? cleanReply(raw) : "";
  if (!text) return;
  const out = await vscode.workspace.openTextDocument({ language: "markdown", content: `# ${info.file}:${info.line + 1}\n\n> ${info.message.split("\n")[0]}\n\n${text}\n` });
  await vscode.window.showTextDocument(out, { viewColumn: vscode.ViewColumn.Beside, preview: true });
}

/** Bombilla del editor: «Explicar este error con MagicTools» en cada error. */
export class DiagnoseActions implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    return context.diagnostics
      .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
      .slice(0, 1)
      .map((diag) => {
        const a = new vscode.CodeAction("MagicTools: explicar este error", vscode.CodeActionKind.QuickFix);
        a.command = { command: "magictools.explainDiagnostic", title: "Explicar este error", arguments: [doc.uri, diag] };
        a.diagnostics = [diag];
        return a;
      });
  }
}

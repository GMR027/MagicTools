import * as vscode from "vscode";
import { cfg } from "../config";
import { RULES_FILE } from "../core/rules";
import { contextSnippet } from "../core/diagnostics";
import { findingRequest, resolveLanguage } from "../core/prompts";
import { isScannable, scanSecrets } from "../core/secrets";
import { checkRules, parseChecks } from "../core/ruleChecks";
import { fileSmells, measure, smellsOf } from "../core/smells";
import { aiDocument, type Ctx } from "./ai";
import { loadRules } from "../runChat";
import { pickEditor } from "./functionTree";
import { flatten, symbolsOf } from "./target";

const SOURCE = "MagicTools";
const MAX_SCAN_BYTES = 400_000;

/** Hallazgos locales (sin IA): los secretos avisan como warning; los smells, como pista discreta. */
export class Findings implements vscode.Disposable {
  private readonly secrets = vscode.languages.createDiagnosticCollection("MagicTools · secretos");
  private readonly smells = vscode.languages.createDiagnosticCollection("MagicTools · smells");
  private readonly rules = vscode.languages.createDiagnosticCollection("MagicTools · reglas");
  private readonly subs: vscode.Disposable[] = [];
  /** Comprobaciones activadas en rules.md (```check). */
  private checks: string[] = [];

  constructor() {
    const scan = (d: vscode.TextDocument) => (this.scanDocument(d), this.checkDocument(d));
    this.subs.push(
      this.secrets,
      this.smells,
      this.rules,
      vscode.workspace.onDidOpenTextDocument(scan),
      vscode.workspace.onDidSaveTextDocument(scan),
      vscode.workspace.onDidCloseTextDocument((d) => (this.smells.delete(d.uri), this.rules.delete(d.uri))),
      // Al cambiar rules.md se vuelven a leer las comprobaciones.
      vscode.workspace.onDidSaveTextDocument((d) => d.uri.path.endsWith(RULES_FILE) && void this.reloadRules()),
    );
    vscode.workspace.textDocuments.forEach(scan);
    void this.reloadRules();
  }

  /** Lee los bloques ```check de rules.md y revisa de nuevo los archivos abiertos. */
  async reloadRules(): Promise<void> {
    this.checks = parseChecks(await loadRules());
    vscode.workspace.textDocuments.forEach((d) => this.checkDocument(d));
  }

  /** «Reglas con dientes»: marca en Problemas lo que incumple las comprobaciones del equipo (sin IA). */
  private checkDocument(doc: vscode.TextDocument): void {
    if (!this.checks.length || doc.uri.scheme !== "file" || doc.getText().length > MAX_SCAN_BYTES) return void this.rules.delete(doc.uri);
    const diags = checkRules(doc.getText(), doc.languageId, this.checks).map((v) => {
      const d = new vscode.Diagnostic(new vscode.Range(v.line, v.column, v.line, v.column + v.length), v.message, vscode.DiagnosticSeverity.Warning);
      d.source = SOURCE;
      d.code = "rule";
      return d;
    });
    this.rules.set(doc.uri, diags);
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
  }

  /** Busca secretos en un documento (si el ajuste está activo). */
  scanDocument(doc: vscode.TextDocument): number {
    const on = vscode.workspace.getConfiguration("magictools").get<boolean>("secrets.scan", true);
    const rel = vscode.workspace.asRelativePath(doc.uri, false);
    if (!on || doc.uri.scheme !== "file" || !isScannable(rel) || doc.getText().length > MAX_SCAN_BYTES) return this.clear(doc.uri);
    const hits = scanSecrets(doc.getText());
    const diags = hits.map((h) => {
      const d = new vscode.Diagnostic(new vscode.Range(h.line, h.column, h.line, h.column + h.length), `${h.rule} (${h.preview}): no lo subas al repositorio.`, vscode.DiagnosticSeverity.Warning);
      d.source = SOURCE;
      d.code = "secret";
      return d;
    });
    this.secrets.set(doc.uri, diags);
    return diags.length;
  }

  private clear(uri: vscode.Uri): number {
    this.secrets.delete(uri);
    return 0;
  }

  /** Revisa el proyecto entero y devuelve cuántos secretos y en cuántos archivos. */
  async scanWorkspace(): Promise<{ hits: number; files: number }> {
    const files = await vscode.workspace.findFiles("**/*", "**/{node_modules,.git,dist,build,out,vendor,venv,.venv,coverage}/**", 3000);
    let hits = 0;
    let withHits = 0;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "MagicTools: buscando secretos…" }, async () => {
      for (const uri of files) {
        if (!isScannable(vscode.workspace.asRelativePath(uri, false))) continue;
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > MAX_SCAN_BYTES) continue;
          const doc = await vscode.workspace.openTextDocument(uri);
          const n = this.scanDocument(doc);
          hits += n;
          if (n) withHits++;
        } catch {
          // binario o ilegible: se omite
        }
      }
    });
    return { hits, files: withHits };
  }

  /** Marca con una pista las funciones raras del archivo activo. */
  async checkSmells(): Promise<number | undefined> {
    const editor = pickEditor();
    if (!editor) {
      void vscode.window.showInformationMessage("MagicTools: abre un archivo de código para revisarlo.");
      return undefined;
    }
    const doc = editor.document;
    const diags: vscode.Diagnostic[] = [];
    for (const s of flatten(await symbolsOf(doc)).filter((x) => x.kind === "function")) {
      const code = doc.getText(new vscode.Range(s.start, 0, Math.min(s.end, doc.lineCount - 1) + 1, 0));
      for (const msg of smellsOf(s.name, measure(code))) {
        const line = doc.lineAt(s.start);
        const d = new vscode.Diagnostic(new vscode.Range(s.start, line.firstNonWhitespaceCharacterIndex, s.start, line.range.end.character), msg, vscode.DiagnosticSeverity.Hint);
        d.source = SOURCE;
        d.code = "smell";
        diags.push(d);
      }
    }
    for (const f of fileSmells(doc.getText(), doc.languageId, vscode.workspace.asRelativePath(doc.uri, false))) {
      const d = new vscode.Diagnostic(new vscode.Range(f.line, f.column, f.line, f.column + f.length), f.message, vscode.DiagnosticSeverity.Hint);
      d.source = SOURCE;
      d.code = "smell";
      diags.push(d);
    }
    this.smells.set(doc.uri, diags);
    return diags.length;
  }
}

/** Bombilla: «explicar este hallazgo» en los avisos de MagicTools. */
export class FindingActions implements vscode.CodeActionProvider {
  provideCodeActions(doc: vscode.TextDocument, _r: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    return context.diagnostics
      .filter((d) => d.source === SOURCE && (d.code === "smell" || d.code === "secret" || d.code === "rule"))
      .map((diag) => {
        const a = new vscode.CodeAction(diag.code === "secret" ? "MagicTools: qué hacer con este secreto" : diag.code === "rule" ? "MagicTools: explicar esta regla" : "MagicTools: cómo mejorar esto", vscode.CodeActionKind.QuickFix);
        a.command = { command: "magictools.explainFinding", title: "Explicar", arguments: [doc.uri, diag] };
        a.diagnostics = [diag];
        return a;
      });
  }
}

/** Explica un hallazgo con la IA. Del código con un secreto se tapa el valor antes de enviarlo. */
export async function explainFinding(ctx: Ctx, uri: vscode.Uri, diag: vscode.Diagnostic): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const lines = doc.getText().split(/\r?\n/);
  const kind = diag.code === "secret" ? "secret" : "smell";
  const line = diag.range.start.line;
  if (kind === "secret") {
    const l = lines[line] ?? "";
    lines[line] = `${l.slice(0, diag.range.start.character)}‹SECRET›${l.slice(diag.range.end.character)}`;
  }
  const snippet = kind === "secret" ? contextSnippet(lines, line, 3) : contextSnippet(lines, line, 15);
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  await aiDocument(ctx, findingRequest(kind, diag.message, snippet, lang), "explicando el aviso", kind === "secret" ? "Secreto en el código" : diag.code === "rule" ? "Regla del equipo" : "Mejorar el código", `\`${vscode.workspace.asRelativePath(uri)}:${line + 1}\``);
}

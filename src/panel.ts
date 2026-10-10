import * as vscode from "vscode";
import * as path from "node:path";
import { enableApiMode } from "./commands";
import { cfg, defaultApiModel, getApiKey, PROVIDER_LABELS, update } from "./config";
import { COLOR_FILES, renderBlock, upsertBlock, type StyleFormat } from "./core/colors";
import { SPECIES, type Species } from "./core/pet";
import { cleanReply, firstCodeBlock, resolveLanguage } from "./core/prompts";
import { LANGUAGES, languageFromEditor, languageId, TABS, toolsByTab, TYPES, type ToolDef } from "./core/registry";
import { inspectLocal, type LocalStatus } from "./localGuard";
import type { PetTracker } from "./pet";
import { chatBackend, runChat } from "./runChat";

/** Mensajes que envía la vista (media/panel.js). */
type Msg =
  | { type: "ready" | "refresh" | "configureApi" }
  | { type: "mode"; mode: "local" | "api" }
  | { type: "runTool"; id: string; values: Record<string, string> }
  | { type: "copy" | "copyCode" | "insertCode" | "clearResult"; id: string }
  | { type: "openUrl"; url: string }
  | { type: "runCommand"; id: string }
  | { type: "petSpecies"; species: Species }
  | { type: "petToggle" }
  | { type: "pickImage"; count: string; format: string }
  | { type: "palette"; colors: string[]; name: string; format: string }
  | { type: "paletteError"; message: string }
  | { type: "copyText"; value: string }
  | { type: "openFile"; path: string };

interface Result {
  text: string;
  language: string;
}

/** Última paleta extraída y dónde se guardó. */
interface Palette {
  name: string;
  colors: string[];
  file: string;
  format: StyleFormat;
}

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Vista lateral de MagicTools: IA local/API y tres pestañas (Starter, Junior, Senior) con sus herramientas. */
export class MagicToolsPanel implements vscode.WebviewViewProvider {
  static readonly viewId = "magictools.panel";

  private view?: vscode.WebviewView;
  private local?: LocalStatus;
  private busy?: string;
  private readonly results = new Map<string, Result>();
  private palette?: Palette;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly tools: readonly ToolDef[],
    private readonly log: vscode.LogOutputChannel,
    private readonly pet: PetTracker,
  ) {
    // El animalito cambia a menudo: solo se actualiza su tarjeta, sin repintar todo el panel.
    context.subscriptions.push(pet.onDidChange((p) => void this.view?.webview.postMessage({ type: "pet", pet: p })));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    view.webview.onDidReceiveMessage((m: Msg) => void this.handle(m));
    // Al volver a mostrarse, GhostCode u Ollama pueden haber cargado o liberado modelos.
    view.onDidChangeVisibility(() => view.visible && void this.refresh());
    view.onDidDispose(() => (this.view = undefined));
  }

  async refresh(): Promise<void> {
    this.local = await inspectLocal();
    await this.post();
  }

  private async handle(m: Msg): Promise<void> {
    switch (m.type) {
      case "ready":
      case "refresh":
        return this.refresh();
      case "mode":
        if (m.mode === "api") await enableApiMode(this.context.secrets);
        else await update("mode", "local");
        return this.refresh();
      case "configureApi":
        await vscode.commands.executeCommand("magictools.configureApi");
        return this.refresh();
      case "runTool":
        return this.runTool(m.id, m.values ?? {});
      case "copy":
        return void vscode.env.clipboard.writeText(this.results.get(m.id)?.text ?? "");
      case "copyCode": {
        const r = this.results.get(m.id);
        if (r) await vscode.env.clipboard.writeText(firstCodeBlock(r.text) ?? r.text);
        return;
      }
      case "insertCode": {
        const r = this.results.get(m.id);
        if (!r) return;
        const doc = await vscode.workspace.openTextDocument({ content: firstCodeBlock(r.text) ?? r.text, language: languageId(r.language) });
        await vscode.window.showTextDocument(doc);
        return;
      }
      case "clearResult":
        this.results.delete(m.id);
        return this.post();
      case "runCommand":
        // Solo herramientas registradas como comando.
        if (this.tools.some((t) => t.id === m.id && t.command)) await vscode.commands.executeCommand(`magictools.tool.${m.id}`);
        return;
      case "petToggle":
        return update("pet.enabled", !this.pet.view().enabled);
      case "petSpecies":
        return this.pet.setSpecies(m.species);
      case "pickImage":
        return this.pickImage(Number(m.count) || 6, m.format);
      case "palette":
        return this.savePalette(m);
      case "paletteError":
        return void vscode.window.showWarningMessage(`MagicTools: no se pudo leer la imagen (${String(m.message).slice(0, 120)}).`);
      case "copyText":
        return void vscode.env.clipboard.writeText(String(m.value).slice(0, 200));
      case "openFile": {
        const root = this.projectRoot();
        const uri = root && vscode.Uri.joinPath(root, m.path);
        // Solo los archivos de estilos que genera esta herramienta.
        if (uri && Object.values(COLOR_FILES).includes(m.path)) await vscode.window.showTextDocument(uri);
        return;
      }
      case "openUrl":
        // Solo enlaces a GitHub (el del autor); nada arbitrario desde la vista.
        if (/^https:\/\/github\.com\/[\w.-]+\/?$/.test(m.url)) await vscode.env.openExternal(vscode.Uri.parse(m.url));
        return;
    }
  }

  private projectRoot(): vscode.Uri | undefined {
    const doc = vscode.window.activeTextEditor?.document.uri;
    return (doc && vscode.workspace.getWorkspaceFolder(doc)?.uri) ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  /** Elige una imagen y se la manda a la vista, que calcula la paleta (necesita un <canvas>). */
  private async pickImage(count: number, format: string): Promise<void> {
    if (!this.projectRoot()) {
      void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto para guardar los colores.");
      return;
    }
    const [file] =
      (await vscode.window.showOpenDialog({ canSelectMany: false, title: "Imagen de la que sacar los colores", filters: { Imágenes: Object.keys(IMAGE_TYPES) } })) ?? [];
    if (!file) return;
    const ext = path.extname(file.fsPath).slice(1).toLowerCase();
    const mime = IMAGE_TYPES[ext];
    if (!mime) return void vscode.window.showWarningMessage("MagicTools: ese formato de imagen no es compatible.");
    const bytes = await vscode.workspace.fs.readFile(file);
    if (bytes.byteLength > MAX_IMAGE_BYTES) return void vscode.window.showWarningMessage("MagicTools: la imagen pesa más de 8 MB; usa una más pequeña.");
    await this.view?.webview.postMessage({
      type: "extract",
      dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
      name: path.basename(file.fsPath),
      count: Math.max(2, Math.min(12, count)),
      format,
    });
  }

  /** Guarda la paleta en src/css/colors.css o src/sass/_colors.scss (creando las carpetas si faltan). */
  private async savePalette(m: { colors: string[]; name: string; format: string }): Promise<void> {
    const root = this.projectRoot();
    const format: StyleFormat = m.format === "Sass" ? "Sass" : "CSS";
    const colors = (Array.isArray(m.colors) ? m.colors : []).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 16);
    const name = String(m.name ?? "imagen").slice(0, 80);
    if (!root || !colors.length) return void vscode.window.showWarningMessage("MagicTools: no se encontraron colores en la imagen.");
    const rel = COLOR_FILES[format];
    const file = vscode.Uri.joinPath(root, rel);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, ".."));
    let existing: string | undefined;
    try {
      existing = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
    } catch {
      // el archivo aún no existe
    }
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(upsertBlock(existing, renderBlock(format, colors, name), name)));
    this.palette = { name, colors, file: rel, format };
    vscode.window.setStatusBarMessage(`$(check) ${colors.length} colores guardados en ${rel}`, 6000);
    await this.post();
  }

  private async runTool(id: string, values: Record<string, string>): Promise<void> {
    // Solo se ejecutan herramientas registradas; nada arbitrario desde la vista.
    const tool = this.tools.find((t) => t.id === id);
    if (!tool?.request || this.busy) return;
    const missing = tool.fields?.find((f) => !f.optional && f.kind !== "language" && !values[f.id]?.trim());
    if (missing) {
      void vscode.window.showInformationMessage(`MagicTools: rellena «${missing.label}».`);
      return;
    }
    this.busy = id;
    await this.post();
    try {
      const backend = await chatBackend(this.context.secrets);
      if (!backend) return;
      const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
      const raw = await runChat(backend, tool.request(values, lang), tool.title.toLowerCase(), this.log);
      const text = raw ? cleanReply(raw) : "";
      if (text) this.results.set(id, { text, language: values.language ?? "" });
      else if (raw !== undefined) void vscode.window.showWarningMessage("MagicTools: el modelo no devolvió ninguna respuesta.");
    } finally {
      this.busy = undefined;
      await this.refresh();
    }
  }

  private async post(): Promise<void> {
    if (!this.view) return;
    await this.view.webview.postMessage({ type: "state", state: await this.state() });
  }

  /** Lo que muestra la vista. */
  async state() {
    const c = cfg();
    const local = (this.local ??= await inspectLocal());
    let ready: boolean;
    let label: string;
    let problem: string | undefined;
    if (c.mode === "api") {
      const model = c.apiModel || defaultApiModel(c.apiProvider);
      const key = await getApiKey(this.context.secrets, c.apiProvider);
      label = `${PROVIDER_LABELS[c.apiProvider]} · ${model || "sin modelo"}`;
      ready = (!!key || c.apiProvider === "openai-compatible") && !!model;
      if (!ready) problem = "Falta la API key o el modelo. Pulsa para configurarlos.";
    } else {
      ready = local.reachable && !!local.model;
      label = local.model ? `Local · ${local.model}` : "Local";
      if (!local.reachable) problem = `Ollama no responde en ${local.url}.`;
      else if (!local.model) problem = local.notice?.text ?? "No hay un modelo de chat disponible.";
    }
    return {
      version: String(this.context.extension.packageJSON.version ?? ""),
      tabs: TABS,
      types: TYPES,
      tools: toolsByTab(this.tools),
      total: this.tools.length,
      ai: {
        mode: c.mode,
        ready,
        label,
        problem,
        // En modo API no hay nada que compartir con GhostCode.
        notice: c.mode === "local" && local.reachable ? local.notice : undefined,
        ghostInstalled: local.ghostInstalled,
      },
      busy: this.busy,
      results: Object.fromEntries(this.results),
      languages: LANGUAGES.map((l) => l.label),
      pet: this.pet.view(),
      species: SPECIES,
      palette: this.palette,
      editorLanguage: languageFromEditor(vscode.window.activeTextEditor?.document.languageId),
    };
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const css = webview.asWebviewUri(vscode.Uri.joinPath(media, "panel.css"));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(media, "panel.js"));
    const colors = webview.asWebviewUri(vscode.Uri.joinPath(media, "colors.js"));
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src data:; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>MagicTools</title>
</head>
<body>
<div id="app"><p class="muted">Cargando…</p></div>
<script nonce="${nonce}" src="${colors}"></script>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}

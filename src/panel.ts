import * as vscode from "vscode";
import * as path from "node:path";
import { enableApiMode } from "./commands";
import { cfg, defaultApiModel, getApiKey, PROVIDER_LABELS, update } from "./config";
import { COLOR_FILES, renderBlock, upsertBlock, type StyleFormat } from "./core/colors";
import { SPECIES, type Species } from "./core/pet";
import { applyCode } from "./core/apply";
import { findTemplate, planFiles, previewPaths, slugify, TEMPLATE_GROUPS, TEMPLATES, isSafePath } from "./core/templates";
import { cleanReply, extractSvg, firstCodeBlock, resolveLanguage, type SvgResult } from "./core/prompts";
import { detectHardware, hardwareMessage, type Hardware } from "./core/hardware";
import { ASSETS_DIR, freeFileName, iconBaseName, isWorkshop, kindOf, PET_ICON_FILE, svgDataUri, workshopLanguageId } from "./core/workshop";
import { LANGUAGES, languageFromEditor, languageId, TABS, toolsByTab, TYPES, type ToolDef } from "./core/registry";
import { inspectLocal, type LocalStatus } from "./localGuard";
import type { PetTracker } from "./pet";
import { chatBackend, runChat } from "./runChat";
import { pickEditor } from "./tools/functionTree";
import { proposeEdit } from "./tools/propose";
import { recordReply } from "./history";

export { PROPOSED_SCHEME, proposedProvider } from "./tools/propose";

/** Mensajes que envía la vista (media/panel.js). */
type Msg =
  | { type: "ready" | "refresh" | "configureApi" }
  | { type: "mode"; mode: "local" | "api" }
  | { type: "runTool"; id: string; values: Record<string, string> }
  | { type: "copy" | "copyCode" | "insertCode" | "applyCode" | "clearResult"; id: string }
  | { type: "openUrl"; url: string }
  | { type: "runCommand"; id: string }
  | { type: "petSpecies"; species: Species }
  | { type: "petToggle" }
  | { type: "pickImage"; count: string; format: string }
  | { type: "palette"; colors: string[]; name: string; format: string }
  | { type: "paletteError"; message: string }
  | { type: "copyText"; value: string }
  | { type: "openFile"; path: string }
  | { type: "createStructure"; template: string; where: string }
  | { type: "workshopSave" | "workshopCopy" | "workshopPet"; id: string }
  | { type: "petIconClear" };

interface Result {
  text: string;
  language: string;
  /** Id de lenguaje de VS Code para abrirlo en un archivo (si se conoce). */
  languageId?: string;
  /** Solo en El Taller: el SVG ya validado, o por qué se rechazó. */
  svg?: SvgResult;
  /** Lo que se pidió (para dar nombre al archivo). */
  prompt?: string;
  /** Tipo de artefacto de El Taller que produjo este resultado. */
  kind?: string;
}

/** Resultado de la última estructura creada, para mostrarlo en el panel. */
interface StructureResult {
  template: string;
  folder: string;
  created: number;
  skipped: number;
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
  private structure?: StructureResult;
  private hardware?: Hardware;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly tools: readonly ToolDef[],
    private readonly log: vscode.LogOutputChannel,
    private readonly pet: PetTracker,
  ) {
    // El animalito cambia a menudo: solo se actualiza su tarjeta, sin repintar todo el panel.
    // La detección de GPU puede tardar unos segundos: no bloquea el panel, que se actualiza al terminar.
    void detectHardware().then((h) => ((this.hardware = h), this.post()));
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
        const doc = await vscode.workspace.openTextDocument({ content: firstCodeBlock(r.text) ?? r.text, language: r.languageId ?? languageId(r.language) });
        await vscode.window.showTextDocument(doc);
        return;
      }
      case "applyCode":
        return this.applyCode(m.id);
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
      case "createStructure":
        return this.createStructure(m.template, m.where);
      case "workshopSave":
        return this.workshopSave(m.id);
      case "workshopCopy": {
        const svg = this.workshopSvg(m.id);
        if (svg) await vscode.env.clipboard.writeText(svg);
        return;
      }
      case "workshopPet":
        return this.workshopPet(m.id);
      case "petIconClear":
        return this.petIconClear();
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

  /** Muestra el diff nativo con el código propuesto (en la selección o en el cursor) y pregunta si aplicarlo. */
  private async applyCode(id: string): Promise<void> {
    const r = this.results.get(id);
    const code = r && (firstCodeBlock(r.text) ?? "");
    const editor = pickEditor();
    if (!r || !code) return;
    if (!editor || editor.document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage("MagicTools: abre un archivo en el editor y coloca el cursor (o selecciona) donde quieras el código.");
      return;
    }
    const doc = editor.document;
    const start = doc.offsetAt(editor.selection.start);
    const end = doc.offsetAt(editor.selection.end);
    const range = new vscode.Range(editor.selection.start, editor.selection.end);
    await proposeEdit(doc, applyCode(doc.getText(), start, end, code), range, code, range.isEmpty ? "¿Insertar el código en la posición del cursor?" : "¿Reemplazar la selección con el código propuesto?");
  }

  /** Crea los archivos de una plantilla en la carpeta abierta o en una carpeta nueva. Nunca pisa lo que ya existe. */
  private async createStructure(id: string, where: string): Promise<void> {
    const tpl = findTemplate(id);
    if (!tpl) return;
    let root: vscode.Uri;
    let name: string;
    if (where === "new") {
      const raw = await vscode.window.showInputBox({
        title: "Nombre del proyecto",
        prompt: "Se creará una carpeta con este nombre (minúsculas, números y guiones).",
        value: "mi-proyecto",
        validateInput: (v) => (v.trim() ? undefined : "Escribe un nombre"),
      });
      if (raw === undefined) return;
      name = slugify(raw);
      const [parent] =
        (await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Crear aquí",
          title: `¿Dónde creo la carpeta «${name}»?`,
          defaultUri: this.projectRoot() && vscode.Uri.joinPath(this.projectRoot()!, ".."),
        })) ?? [];
      if (!parent) return;
      root = vscode.Uri.joinPath(parent, name);
    } else {
      const open = this.projectRoot();
      if (!open) {
        void vscode.window.showInformationMessage("MagicTools: no hay ninguna carpeta abierta. Ábrela, o elige «En una carpeta nueva».");
        return;
      }
      root = open;
      name = slugify(path.basename(open.fsPath));
    }

    const files = planFiles(tpl, name).filter((f) => isSafePath(f.path));
    const exists = async (u: vscode.Uri) => vscode.workspace.fs.stat(u).then(() => true, () => false);
    const todo: typeof files = [];
    for (const f of files) if (!(await exists(vscode.Uri.joinPath(root, ...f.path.split("/"))))) todo.push(f);
    if (!todo.length) {
      void vscode.window.showInformationMessage(`MagicTools: «${root.fsPath}» ya tiene todos esos archivos; no se cambió nada.`);
      return;
    }
    const entries = await vscode.workspace.fs.readDirectory(root).then((e) => e, () => []);
    if (entries.length) {
      const ok = await vscode.window.showWarningMessage(
        `La carpeta «${path.basename(root.fsPath)}» ya tiene archivos. Se crearán solo los que faltan (${todo.length} de ${files.length}) y no se cambiará nada de lo que ya existe.`,
        { modal: true },
        "Crear los que faltan",
      );
      if (ok !== "Crear los que faltan") return;
    }
    for (const f of todo) {
      const uri = vscode.Uri.joinPath(root, ...f.path.split("/"));
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(f.content));
    }
    this.structure = { template: tpl.label, folder: root.fsPath, created: todo.length, skipped: files.length - todo.length };
    await this.post();
    const readme = vscode.Uri.joinPath(root, "README.md");
    if (where === "new") {
      const pick = await vscode.window.showInformationMessage(`MagicTools: «${name}» creado con ${todo.length} archivos (${tpl.label}).`, "Abrir carpeta", "Solo avisar");
      if (pick === "Abrir carpeta") await vscode.commands.executeCommand("vscode.openFolder", root, { forceNewWindow: true });
    } else {
      void vscode.window.showInformationMessage(`MagicTools: ${todo.length} archivos creados (${tpl.label}).`);
      await vscode.window.showTextDocument(readme, { preview: false });
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
    if (isWorkshop(id) && !vscode.workspace.getConfiguration("magictools").get<boolean>("workshop.enabled", true)) return;
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
      const raw = await runChat(backend, tool.request(values, lang), isWorkshop(id) ? "creando en El Taller" : tool.title.toLowerCase(), this.log);
      const text = raw ? cleanReply(raw) : "";
      if (text) {
        const result: Result = { text, language: values.language ?? "" };
        if (isWorkshop(id)) {
          result.languageId = workshopLanguageId(values);
          result.prompt = values.description ?? "";
          result.kind = kindOf(values);
          if (kindOf(values) === "Icono SVG") {
            result.svg = extractSvg(text);
            if (!result.svg.ok) this.log.warn(`El Taller: SVG rechazado (${result.svg.reason})`);
          }
        }
        this.results.set(id, result);
        recordReply(tool.title, "", text);
      }
      else if (raw !== undefined) void vscode.window.showWarningMessage("MagicTools: el modelo no devolvió ninguna respuesta.");
    } finally {
      this.busy = undefined;
      await this.refresh();
    }
  }

  /** El SVG validado de un resultado de El Taller (undefined, con aviso, si no hay o se rechazó). */
  private workshopSvg(id: string): string | undefined {
    const svg = isWorkshop(id) ? this.results.get(id)?.svg : undefined;
    if (svg?.ok) return svg.svg;
    void vscode.window.showInformationMessage("MagicTools: no hay un icono válido que usar. Vuelve a crearlo.");
    return undefined;
  }

  /** Guarda el icono en assets/ con un nombre libre: nunca sobrescribe. */
  private async workshopSave(id: string): Promise<void> {
    const svg = this.workshopSvg(id);
    const root = this.projectRoot();
    if (!svg) return;
    if (!root) return void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto para guardar el icono.");
    const dir = vscode.Uri.joinPath(root, ASSETS_DIR);
    await vscode.workspace.fs.createDirectory(dir);
    const taken = new Set((await vscode.workspace.fs.readDirectory(dir)).map(([name]) => name.toLowerCase()));
    const name = freeFileName(taken, iconBaseName(this.results.get(id)?.prompt ?? ""), "svg");
    const file = vscode.Uri.joinPath(dir, name);
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(`${svg}\n`));
    vscode.window.setStatusBarMessage(`$(check) Icono guardado en ${ASSETS_DIR}/${name}`, 6000);
    await vscode.window.showTextDocument(file, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }

  /** Guarda el icono como cara del animalito (.magictools/pet-icon.svg). Si ya había uno, pregunta antes de cambiarlo. */
  private async workshopPet(id: string): Promise<void> {
    const svg = this.workshopSvg(id);
    const root = this.projectRoot();
    if (!svg) return;
    if (!root) return void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto: la cara se guarda en ella.");
    const file = vscode.Uri.joinPath(root, ...PET_ICON_FILE.split("/"));
    const exists = await vscode.workspace.fs.stat(file).then(() => true, () => false);
    if (exists) {
      const ok = await vscode.window.showWarningMessage("Ya hay una cara personalizada para tu animalito. ¿La cambio por este icono?", { modal: true }, "Cambiar");
      if (ok !== "Cambiar") return;
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, ".."));
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(`${svg}\n`));
    vscode.window.setStatusBarMessage(`$(check) Cara del animalito guardada en ${PET_ICON_FILE}`, 6000);
    await this.post();
  }

  private async petIconClear(): Promise<void> {
    const root = this.projectRoot();
    if (!root) return;
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(root, ...PET_ICON_FILE.split("/"))).then(undefined, () => undefined);
    await this.post();
  }

  /** La cara personalizada del animalito (data-URI) si existe y sigue siendo un SVG seguro; si no, undefined. */
  private async petIcon(): Promise<string | undefined> {
    const root = this.projectRoot();
    if (!root) return undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, ...PET_ICON_FILE.split("/")));
      if (bytes.byteLength > 40_000) return undefined;
      const svg = extractSvg(new TextDecoder().decode(bytes));
      return svg.ok ? svgDataUri(svg.svg) : undefined;
    } catch {
      return undefined;
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
    const workshopOn = vscode.workspace.getConfiguration("magictools").get<boolean>("workshop.enabled", true);
    const tools = this.tools.filter((t) => workshopOn || !isWorkshop(t.id));
    const hw = workshopOn ? this.hardware : undefined;
    return {
      version: String(this.context.extension.packageJSON.version ?? ""),
      tabs: TABS,
      types: TYPES,
      tools: toolsByTab(tools),
      total: tools.length,
      hardware: hw && { tier: hw.tier, text: hardwareMessage(hw, c.mode) },
      petIcon: await this.petIcon(),
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
      // El SVG se envía ya validado y como data-URI para un <img>; la vista nunca lo inserta como HTML.
      results: Object.fromEntries([...this.results].map(([k, r]) => [k, { text: r.text, language: r.language, kind: r.kind, svgUri: r.svg?.ok ? svgDataUri(r.svg.svg) : undefined, svgProblem: r.svg && !r.svg.ok ? r.svg.reason : undefined }])),
      languages: LANGUAGES.map((l) => l.label),
      pet: this.pet.view(),
      species: SPECIES,
      palette: this.palette,
      templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, group: t.group, hint: t.hint, paths: previewPaths(t) })),
      templateGroups: TEMPLATE_GROUPS,
      structure: this.structure,
      projectFolder: this.projectRoot() && path.basename(this.projectRoot()!.fsPath),
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

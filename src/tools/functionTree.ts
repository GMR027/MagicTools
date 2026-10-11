import * as path from "node:path";
import * as vscode from "vscode";
import { buildGraph, enclosing, parseFunctions, type FnInfo } from "../core/callgraph";
import { renderTreeMarkdown, treeFileName, type CallNode } from "../core/tree";

export const TREE_DIR = "Arbol de funciones";
const MAX_NODES = 80;
const UP_DEPTH = 6;
const DOWN_DEPTH = 3;

const CODE_GLOB = "**/*.{js,jsx,mjs,cjs,ts,tsx,vue,svelte,py,php,java,cs,go,rs,rb,kt,swift,c,cc,cpp,h,hpp}";
const EXCLUDE = `**/{node_modules,.git,dist,build,out,vendor,venv,.venv,__pycache__,target,coverage,.next,${TREE_DIR}}/**`;
const MAX_FILES = 1500;
const MAX_FILE_BYTES = 400_000;

type Item = vscode.CallHierarchyItem;

/** Último editor de texto usado: al pulsar en el panel, el editor activo puede no estar disponible. */
let lastEditor: vscode.TextEditor | undefined;
export function trackEditors(context: vscode.ExtensionContext): void {
  lastEditor = vscode.window.activeTextEditor;
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => e && (lastEditor = e)));
}

export function pickEditor(): vscode.TextEditor | undefined {
  const isCode = (e: vscode.TextEditor | undefined) => !!e && (e.document.uri.scheme === "file" || e.document.uri.scheme === "untitled");
  const candidates = [vscode.window.activeTextEditor, lastEditor, ...vscode.window.visibleTextEditors];
  return candidates.find((e) => isCode(e) && !e!.document.isClosed);
}

// --- Con el servidor del lenguaje (jerarquía de llamadas) ---------------------------------

async function prepare(doc: vscode.TextDocument, sel: vscode.Selection): Promise<Item | undefined> {
  const at = async (pos: vscode.Position) => (await vscode.commands.executeCommand<Item[] | undefined>("vscode.prepareCallHierarchy", doc.uri, pos))?.[0];
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>("vscode.executeDocumentSymbolProvider", doc.uri);
  const fnKinds = new Set([vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Constructor]);
  let best: vscode.DocumentSymbol | undefined;
  const find = (list: vscode.DocumentSymbol[]) => {
    for (const s of list) {
      if (!s.range.contains(sel.start)) continue;
      if (fnKinds.has(s.kind)) best = s;
      find(s.children ?? []);
    }
  };
  find(Array.isArray(symbols) ? symbols.filter((s) => "children" in s) : []);
  // La función que contiene la selección manda; si no hay, lo que esté bajo el cursor.
  return (best && (await at(best.selectionRange.start))) || at(sel.start);
}

const itemKey = (i: Item) => `${i.uri.toString()}|${i.name}|${i.selectionRange.start.line}`;

async function walkLsp(root: Item, dir: "incoming" | "outgoing", maxDepth: number, rel: (u: vscode.Uri) => string): Promise<CallNode[]> {
  const command = dir === "incoming" ? "vscode.provideIncomingCalls" : "vscode.provideOutgoingCalls";
  let budget = MAX_NODES;
  const go = async (item: Item, depth: number, chain: Set<string>): Promise<CallNode[]> => {
    const calls = (await vscode.commands.executeCommand<(vscode.CallHierarchyIncomingCall | vscode.CallHierarchyOutgoingCall)[] | undefined>(command, item)) ?? [];
    const out: CallNode[] = [];
    for (const call of calls) {
      const next = "from" in call ? call.from : call.to;
      const node: CallNode = { name: next.name, file: rel(next.uri), line: next.selectionRange.start.line + 1, children: [] };
      if (chain.has(itemKey(next))) node.flag = "cycle";
      else if (budget <= 0 || depth >= maxDepth) node.flag = "more";
      else {
        budget--;
        node.children = await go(next, depth + 1, new Set([...chain, itemKey(next)]));
      }
      out.push(node);
    }
    return out;
  };
  return go(root, 1, new Set([itemKey(root)]));
}

// --- Sin servidor de lenguaje: análisis por texto de todo el proyecto ------------------------

async function indexProject(folder: vscode.WorkspaceFolder, rel: (u: vscode.Uri) => string): Promise<FnInfo[]> {
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, CODE_GLOB), new vscode.RelativePattern(folder, EXCLUDE), MAX_FILES);
  const open = new Map(vscode.workspace.textDocuments.map((d) => [d.uri.toString(), d]));
  const out: FnInfo[] = [];
  await Promise.all(
    files.map(async (uri) => {
      try {
        // Lo abierto y sin guardar se lee del editor, no del disco.
        const doc = open.get(uri.toString());
        let text: string;
        if (doc) text = doc.getText();
        else {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > MAX_FILE_BYTES) return;
          text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        }
        const file = rel(uri);
        for (const d of parseFunctions(text, path.extname(uri.fsPath).slice(1).toLowerCase())) out.push({ ...d, file });
      } catch {
        // archivo ilegible: se omite
      }
    }),
  );
  return out;
}

/** Función elegida: la que contiene la selección o, si se seleccionó solo un nombre, la que se llame así. */
function pickTarget(index: FnInfo[], file: string, sel: vscode.Selection, doc: vscode.TextDocument): FnInfo | undefined {
  const inFile = index.filter((f) => f.file === file);
  const word = doc.getText(sel).trim();
  const byWord = /^[\w$]+$/.test(word) ? (inFile.find((f) => f.name === word) ?? index.find((f) => f.name === word)) : undefined;
  const containing = enclosing(inFile, sel.start.line);
  return containing ? inFile.find((f) => f.line === containing.line && f.name === containing.name) : byWord;
}

// --- Orquestación --------------------------------------------------------------------------

/** Genera «Arbol de funciones/<función>.md» con el recorrido de la función bajo el cursor o seleccionada. */
export async function buildFunctionTree(log: vscode.LogOutputChannel): Promise<void> {
  try {
    await run(log);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    log.error(`Árbol de función: ${(err as Error).stack ?? msg}`);
    void vscode.window.showErrorMessage(`MagicTools: no se pudo crear el árbol (${msg}). Más detalles en Salida → MagicTools.`);
  }
}

async function run(log: vscode.LogOutputChannel): Promise<void> {
  const editor = pickEditor();
  if (!editor) {
    void vscode.window.showInformationMessage("MagicTools: abre un archivo de código y coloca el cursor dentro de una función (o selecciona un trozo).");
    return;
  }
  const doc = editor.document;
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri) ?? vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto (Archivo → Abrir carpeta) para guardar el árbol.");
    return;
  }
  const rel = (u: vscode.Uri) => vscode.workspace.asRelativePath(u, false);
  log.info(`Árbol de función: ${rel(doc.uri)} línea ${editor.selection.start.line + 1}`);

  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "MagicTools: trazando el árbol de la función…" }, async () => {
    let target: CallNode | undefined;
    let callers: CallNode[] = [];
    let callees: CallNode[] = [];
    let via = "";

    // 1) El servidor del lenguaje (el más preciso), si lo hay.
    try {
      const item = await prepare(doc, editor.selection);
      if (item) {
        target = { name: item.name, file: rel(item.uri), line: item.selectionRange.start.line + 1, children: [] };
        [callers, callees] = await Promise.all([walkLsp(item, "incoming", UP_DEPTH, rel), walkLsp(item, "outgoing", DOWN_DEPTH, rel)]);
        via = "servidor del lenguaje";
      }
    } catch (err) {
      log.warn(`Jerarquía de llamadas no disponible: ${(err as Error).message}`);
    }

    // 2) Análisis por texto: funciona con cualquier lenguaje y completa lo que el servidor no vea.
    if (!target || (!callers.length && !callees.length)) {
      const index = await indexProject(folder, rel);
      const fn = pickTarget(index, rel(doc.uri), editor.selection, doc);
      log.info(`Análisis por texto: ${index.length} funciones indexadas, elegida: ${fn?.name ?? "ninguna"}`);
      if (fn) {
        const g = buildGraph(index, fn, { up: UP_DEPTH, down: DOWN_DEPTH, nodes: MAX_NODES });
        if (!target || g.callers.length || g.callees.length) {
          target = { name: fn.name, file: fn.file, line: fn.line + 1, children: [] };
          callers = g.callers;
          callees = g.callees;
          via = "análisis del proyecto";
        }
      }
    }
    return target && { target, callers, callees, via };
  });

  if (!result) {
    void vscode.window.showWarningMessage(
      "MagicTools: no encontré ninguna función donde está el cursor. Coloca el cursor dentro de una función (o selecciona su nombre) y vuelve a intentarlo.",
    );
    return;
  }
  const { target, callers, callees, via } = result;
  const md = renderTreeMarkdown({ target, callers, callees, where: `${target.file}:${target.line}`, generated: new Date() });
  const dir = vscode.Uri.joinPath(folder.uri, TREE_DIR);
  await vscode.workspace.fs.createDirectory(dir); // la crea si no existe
  const file = vscode.Uri.joinPath(dir, treeFileName(target.name));
  await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(md));
  log.info(`Árbol guardado: ${TREE_DIR}/${treeFileName(target.name)} (${via}; ${callers.length} llamadores directos, ${callees.length} llamados)`);
  await vscode.window.showTextDocument(file, { preview: false });
  // Vista previa con los estilos del Markdown de VS Code.
  await Promise.resolve(vscode.commands.executeCommand("markdown.showPreviewToSide", file)).catch(() => undefined);
  void vscode.window.showInformationMessage(`MagicTools: árbol de «${target.name}» guardado en ${TREE_DIR}/${treeFileName(target.name)}.`);
}

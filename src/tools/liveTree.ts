import * as vscode from "vscode";
import { levelOf, measure, smellsOf, type FnMetrics, type Level } from "../core/smells";
import { symbolsOf, type FnNodeArg, type FnSym } from "./target";

const COLORS: Record<Level, string> = { low: "charts.green", medium: "charts.yellow", high: "charts.red" };
const LABELS: Record<Level, string> = { low: "sencilla", medium: "algo compleja", high: "compleja" };

interface Node extends FnNodeArg {
  metrics?: FnMetrics;
}

/** «Árbol viviente»: las funciones del archivo activo coloreadas por complejidad; clic = ir a la función. */
export class LiveTree implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subs: vscode.Disposable[] = [];
  private timer?: NodeJS.Timeout;
  private doc?: vscode.TextDocument;

  constructor() {
    const refresh = (delay: number) => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.emitter.fire(undefined), delay);
    };
    this.subs.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e?.document.uri.scheme === "file") (this.doc = e.document), refresh(50);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === this.doc && refresh(800)),
      vscode.workspace.onDidSaveTextDocument((d) => d === this.doc && refresh(100)),
    );
    this.doc = vscode.window.activeTextEditor?.document;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.subs.forEach((s) => s.dispose());
    this.emitter.dispose();
  }

  async getChildren(node?: Node): Promise<Node[]> {
    const doc = this.doc;
    if (!doc || doc.uri.scheme !== "file") return [];
    const list: FnSym[] = node ? node.sym.children : await symbolsOf(doc);
    return list.map((sym) => ({ uri: doc.uri, sym, metrics: sym.kind === "function" ? measure(this.code(doc, sym)) : undefined }));
  }

  private code(doc: vscode.TextDocument, s: FnSym): string {
    return doc.getText(new vscode.Range(s.start, 0, Math.min(s.end, doc.lineCount - 1) + 1, 0));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const { sym, metrics } = node;
    const item = new vscode.TreeItem(sym.name, sym.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    if (!metrics) {
      item.iconPath = new vscode.ThemeIcon("symbol-class");
      item.contextValue = "mtContainer";
      return item;
    }
    const level = levelOf(metrics);
    item.iconPath = new vscode.ThemeIcon("symbol-function", new vscode.ThemeColor(COLORS[level]));
    item.description = `L${sym.start + 1} · ${metrics.lines} líneas · cx ${metrics.complexity}`;
    const smells = smellsOf(sym.name, metrics);
    item.tooltip = new vscode.MarkdownString(
      [`**${sym.name}** — ${LABELS[level]}`, `${metrics.lines} líneas · ${metrics.params} parámetros · anidación ${metrics.nesting} · complejidad ${metrics.complexity}`, ...smells.map((s) => `- ${s}`)].join("\n\n"),
    );
    item.contextValue = "mtFunction";
    item.command = { command: "vscode.open", title: "Ir a la función", arguments: [node.uri, { selection: new vscode.Range(sym.start, 0, sym.start, 0) }] };
    return item;
  }
}

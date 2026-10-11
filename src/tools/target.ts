import * as vscode from "vscode";
import * as path from "node:path";
import { enclosing, parseFunctions } from "../core/callgraph";
import { pickEditor } from "./functionTree";

/** Una función (o clase con funciones) de un archivo. */
export interface FnSym {
  name: string;
  /** Línea de inicio y fin (0-based, incluida). */
  start: number;
  end: number;
  kind: "function" | "container";
  children: FnSym[];
}

/** Lo que se necesita para trabajar con una función: su código y dónde está. */
export interface FnTarget {
  name: string;
  uri: vscode.Uri;
  file: string;
  language: string;
  code: string;
  start: number;
  /** Zona exacta del documento que ocupa `code`. */
  range: vscode.Range;
}

const K = vscode.SymbolKind;
const FN_KINDS = new Set([K.Function, K.Method, K.Constructor]);
const CONTAINER_KINDS = new Set([K.Class, K.Module, K.Namespace, K.Interface, K.Struct, K.Object]);

function convert(list: vscode.DocumentSymbol[], doc: vscode.TextDocument): FnSym[] {
  const out: FnSym[] = [];
  for (const s of list) {
    const kids = convert(s.children ?? [], doc);
    const firstLine = doc.lineAt(s.range.start.line).text;
    const arrow = (s.kind === K.Variable || s.kind === K.Constant || s.kind === K.Property) && /=>|\bfunction\b/.test(firstLine);
    const base = { name: s.name.replace(/\(.*$/, ""), start: s.range.start.line, end: s.range.end.line };
    if (FN_KINDS.has(s.kind) || arrow) out.push({ ...base, kind: "function", children: kids });
    else if (CONTAINER_KINDS.has(s.kind) && kids.length) out.push({ ...base, kind: "container", children: kids });
    else out.push(...kids);
  }
  return out;
}

/** Funciones del documento: con el servidor del lenguaje y, si no responde, por análisis de texto. */
export async function symbolsOf(doc: vscode.TextDocument): Promise<FnSym[]> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>("vscode.executeDocumentSymbolProvider", doc.uri);
    if (Array.isArray(symbols) && symbols.length && "children" in symbols[0]) {
      const found = convert(symbols, doc);
      if (found.length) return found;
    }
  } catch {
    // sin servidor: se usa el análisis de texto
  }
  const ext = path.extname(doc.uri.fsPath).slice(1).toLowerCase();
  return parseFunctions(doc.getText(), ext).map((d) => ({ name: d.name, start: d.line, end: d.end, kind: "function" as const, children: [] }));
}

export const flatten = (list: FnSym[]): FnSym[] => list.flatMap((s) => [s, ...flatten(s.children)]);

function toTarget(doc: vscode.TextDocument, s: FnSym): FnTarget {
  const end = doc.lineAt(Math.min(s.end, doc.lineCount - 1)).range.end;
  const range = new vscode.Range(s.start, 0, end.line, end.character);
  return {
    name: s.name,
    uri: doc.uri,
    file: vscode.workspace.asRelativePath(doc.uri),
    language: doc.languageId,
    code: doc.getText(range),
    start: s.start,
    range,
  };
}

/** Argumento de un comando lanzado desde el árbol de funciones (o nada si viene de la paleta). */
export interface FnNodeArg {
  uri: vscode.Uri;
  sym: FnSym;
}

/** La función del nodo pulsado en el árbol o, si no hay, la que contiene el cursor (o la selección). */
export async function resolveTarget(arg?: FnNodeArg): Promise<FnTarget | undefined> {
  if (arg?.sym && arg.uri) return toTarget(await vscode.workspace.openTextDocument(arg.uri), arg.sym);
  const editor = pickEditor();
  if (!editor) {
    void vscode.window.showInformationMessage("MagicTools: abre un archivo y coloca el cursor dentro de una función.");
    return undefined;
  }
  const doc = editor.document;
  const sel = editor.selection;
  if (!sel.isEmpty) {
    const text = doc.getText(sel);
    return { name: text.trim().split(/\s+/)[0]?.slice(0, 40) || "selección", uri: doc.uri, file: vscode.workspace.asRelativePath(doc.uri), language: doc.languageId, code: text, start: sel.start.line, range: new vscode.Range(sel.start, sel.end) };
  }
  const syms = flatten(await symbolsOf(doc)).filter((s) => s.kind === "function");
  const best = enclosing(syms.map((s) => ({ name: s.name, line: s.start, end: s.end, calls: [] })), sel.active.line);
  const sym = best && syms.find((s) => s.start === best.line && s.name === best.name);
  if (!sym) {
    void vscode.window.showInformationMessage("MagicTools: no encontré ninguna función donde está el cursor. Colócalo dentro de una (o selecciona el código).");
    return undefined;
  }
  return toTarget(doc, sym);
}

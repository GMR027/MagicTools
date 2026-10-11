import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as http from "node:http";
import { after, before, test } from "node:test";
import { activate } from "../src/extension";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vscode = require("./support/vscode-mock.cjs");

/** Ollama falso: responde a todo con el texto que se le indique. */
let reply = "## Resumen\nlisto";
let server: http.Server;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/api/tags") return void res.end(JSON.stringify({ models: [{ name: "fake:1b", size: 1 }] }));
    if (req.url === "/api/ps") return void res.end(JSON.stringify({ models: [] }));
    req.resume();
    req.on("end", () => res.end(JSON.stringify({ message: { content: reply }, done: true }) + "\n"));
  });
  await new Promise<void>((ok) => server.listen(0, ok));
  vscode.__settings["local.url"] = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vscode.__settings.language = "es";
});
after(() => {
  // La extensión deja temporizadores (el animalito): se liberan para que el proceso de pruebas termine.
  context.subscriptions.forEach((d) => d.dispose());
  server.closeAllConnections();
  server.close();
});

const memento = () => {
  const m = new Map<string, unknown>();
  return { get: (k: string, d?: unknown) => m.get(k) ?? d, update: async (k: string, v: unknown) => void m.set(k, v) };
};
const context = {
  subscriptions: [] as { dispose(): void }[],
  secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} },
  globalState: memento(),
  workspaceState: memento(),
  extensionUri: vscode.Uri.file("/ext"),
  extension: { packageJSON: { version: "test" } },
};

test("la extensión se activa y registra todos los comandos de package.json", () => {
  activate(context as never);
  const declared: string[] = JSON.parse(readFileSync("package.json", "utf8")).contributes.commands.map((c: { command: string }) => c.command);
  const registered: string[] = [...vscode.__commands.keys()];
  assert.deepEqual(declared.filter((c) => !registered.includes(c)), []);
  assert.deepEqual(registered.filter((c) => !declared.includes(c)), []);
  assert.deepEqual(vscode.__log.warn, [], "el registro de herramientas no debe dar avisos");
});

test("sin editor ni carpeta abierta, ningún comando falla y todos avisan al usuario", async () => {
  const skip = /configureApi|setApiKey|clearApiKey|openPanel|refreshPanel|explainFinding/;
  for (const [id, fn] of vscode.__commands as Map<string, () => unknown>) {
    if (skip.test(id)) continue;
    vscode.__messages.length = 0;
    await assert.doesNotReject(async () => void (await fn()), id);
    const texts: string[] = vscode.__messages.map((m: string[]) => m[1]);
    // «Explicar cambios» empieza con un selector de origen: cancelarlo es silencioso, como en VS Code.
    if (!/explain-diff/.test(id)) assert.ok(texts.length > 0, `${id}: debería explicar por qué no hace nada`);
    // «Revisar code smells» no puede decir a la vez «abre un archivo» y «¡Bien hecho!».
    assert.ok(!(texts.length > 1 && texts.some((t) => /Bien hecho/.test(t))), `${id}: mensajes contradictorios: ${texts.join(" | ")}`);
  }
});

test("Dividir función: una respuesta que termina con el bloque de código se aplica (regresión de cleanReply)", async () => {
  const text = "function big(a) {\n  return a;\n}\n";
  const lines = text.split("\n");
  const offsets: number[] = [];
  let o = 0;
  for (const l of lines) (offsets.push(o), (o += l.length + 1));
  const uri = vscode.Uri.file("/p/a.js");
  const doc = {
    uri, languageId: "javascript", isClosed: false, lineCount: lines.length,
    getText: (r?: { start: { line: number; character: number }; end: { line: number; character: number } }) => (r ? text.slice(offsets[r.start.line] + r.start.character, offsets[r.end.line] + r.end.character) : text),
    lineAt: (n: number) => ({ text: lines[n], range: { end: { line: n, character: lines[n].length } } }),
    offsetAt: (p: { line: number; character: number }) => offsets[p.line] + p.character,
  };
  const editor = { document: doc, selection: Object.assign(new vscode.Range(1, 0, 1, 0), { active: new vscode.Position(1, 0) }) };
  vscode.window.activeTextEditor = editor;
  vscode.window.visibleTextEditors = [editor];
  vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file("/p"), name: "p" }];
  vscode.workspace.getWorkspaceFolder = () => vscode.workspace.workspaceFolders[0];
  vscode.workspace.openTextDocument = async (x: { content?: string }) => (x?.content !== undefined ? { uri: vscode.Uri.from({ scheme: "untitled", path: "u" }), getText: () => x.content } : doc);
  const diffs: unknown[] = [];
  vscode.commands.executeCommand = async (c: string) => void (c === "vscode.diff" && diffs.push(c));
  const asked: string[] = [];
  vscode.window.showInformationMessage = async (m: string, ...b: string[]) => (asked.push(m), b.find((x) => x === "Aplicar" || x === "Dividir"));
  let edits = 0;
  vscode.workspace.applyEdit = async () => (edits++, true);

  reply = "## Qué extraje\n- helper\n## Código\n```js\nfunction big(a) {\n  return helper(a);\n}\nfunction helper(a) {\n  return a;\n}\n```";
  await vscode.__commands.get("magictools.tool.split-fn")();
  assert.equal(diffs.length, 1, "debe mostrar el diff");
  assert.equal(edits, 1, "debe aplicar la edición");
  assert.ok(asked.some((q) => /Reemplazar «big» por la versión dividida/.test(q)));
});

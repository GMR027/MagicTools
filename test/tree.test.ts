import assert from "node:assert/strict";
import { test } from "node:test";
import { drawTree, mergePaths, pathsToTarget, renderTreeMarkdown, treeFileName, type CallNode } from "../src/core/tree";

const n = (name: string, children: CallNode[] = [], extra: Partial<CallNode> = {}): CallNode => ({ name, file: `${name}.ts`, line: 1, children, ...extra });

// main → run → target ;  cli → run → target ;  target → helper → deep
const target = n("target");
const callers = [n("run", [n("main"), n("cli")])];
const callees = [n("helper", [n("deep")])];

test("pathsToTarget da un camino por cada punto de entrada", () => {
  const paths = pathsToTarget(target, callers).map((p) => p.map((x) => x.name).join(">"));
  assert.deepEqual(paths.sort(), ["cli>run>target", "main>run>target"]);
});

test("sin llamadores, la función es su propio punto de entrada", () => {
  assert.deepEqual(pathsToTarget(target, []).map((p) => p.map((x) => x.name)), [["target"]]);
});

test("mergePaths junta los caminos con el mismo comienzo", () => {
  const roots = mergePaths([
    [{ name: "a", children: [] }, { name: "b", children: [] }],
    [{ name: "a", children: [] }, { name: "c", children: [] }],
  ]);
  assert.equal(roots.length, 1);
  assert.deepEqual(roots[0].children.map((c) => c.name), ["b", "c"]);
});

test("drawTree usa líneas y flechas y marca la función elegida", () => {
  const flow = mergePaths(pathsToTarget(target, callers));
  const text = drawTree(flow, (x) => x.name === "target");
  assert.match(text, /^main {2}‹main\.ts:1›/m);
  assert.match(text, /└─▶ ★ target.*◀── AQUÍ/);
  assert.equal(text.split("\n").filter((l) => l.includes("target")).length, 2);
});

test("renderTreeMarkdown genera resumen, árboles, diagrama y archivos", () => {
  const md = renderTreeMarkdown({ target, callers, callees, where: "src/target.ts:1", generated: new Date(2026, 9, 9, 12) });
  assert.match(md, /^# 🌳 Árbol de función · `target`/);
  assert.match(md, /```mermaid\nflowchart TD/);
  assert.match(md, /-\.->/);
  assert.match(md, /1\. `main` ➜ `run` ➜ `target`/);
  assert.match(md, /- `deep\.ts`/);
  assert.match(md, /\| \*\*2\*\* \| \*\*3\*\* \| \*\*2\*\* \| \*\*6\*\* \|/);
});

test("una función que nadie llama se marca como punto de entrada", () => {
  const md = renderTreeMarkdown({ target, callers: [], callees: [], where: "x:1", generated: new Date() });
  assert.match(md, /es un punto de entrada/);
  assert.match(md, /No llama a ninguna otra función/);
});

test("las recursiones se marcan", () => {
  const md = renderTreeMarkdown({ target, callers: [n("loop", [], { flag: "cycle" })], callees: [], where: "x:1", generated: new Date() });
  assert.match(md, /↺ recursión/);
});

test("treeFileName limpia el nombre", () => {
  assert.equal(treeFileName("Foo.bar<T>"), "Foo.bar_T.md");
  assert.equal(treeFileName("???"), "funcion.md");
});

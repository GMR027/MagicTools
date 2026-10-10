import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph, enclosing, parseFunctions, type FnInfo } from "../src/core/callgraph";

const ts = `export function main() {
  const total = run(2);
  console.log(total);
}

const run = (n: number): number => {
  const doubled = helper(n);
  if (doubled > 3) { return doubled + 1; }
  return doubled;
};

class Repo {
  async save(item: string) {
    return helper(item);
  }
}

function helper(x: any): any {
  return x * 2;
}
`;

test("parseFunctions encuentra funciones, flechas y métodos en TypeScript con su cuerpo y sus llamadas", () => {
  const defs = parseFunctions(ts, "ts");
  assert.deepEqual(defs.map((d) => d.name), ["main", "run", "save", "helper"]);
  const main = defs[0];
  assert.deepEqual([main.line, main.end], [0, 3]);
  assert.ok(main.calls.includes("run") && main.calls.includes("log"));
  assert.deepEqual(defs[1].calls.filter((c) => !["log"].includes(c)), ["helper"], "if(...) no cuenta como llamada");
  assert.equal(defs[3].calls.length, 0);
});

test("parseFunctions en Python usa la sangría", () => {
  const py = "def a():\n    b()\n    return 1\n\ndef b():\n    print('x')\n\nclass K:\n    def m(self):\n        a()\n";
  const defs = parseFunctions(py, "py");
  assert.deepEqual(defs.map((d) => [d.name, d.line, d.end]), [["a", 0, 2], ["b", 4, 5], ["m", 8, 9]]);
  assert.deepEqual(defs[0].calls, ["b"]);
});

test("parseFunctions en PHP, Go, Java y Rust", () => {
  assert.deepEqual(parseFunctions("<?php\nfunction saludar($n) {\n  return strtoupper($n);\n}\nclass A {\n  public static function crear() {\n    saludar('x');\n  }\n}\n", "php").map((d) => d.name), ["saludar", "crear"]);
  assert.deepEqual(parseFunctions("func (s *S) Run(x int) int {\n\treturn helper(x)\n}\nfunc helper(x int) int { return x }\n", "go").map((d) => d.name), ["Run", "helper"]);
  assert.deepEqual(parseFunctions("public class A {\n  public static int suma(int a, int b) {\n    return a + b;\n  }\n}\n", "java").map((d) => d.name), ["suma"]);
  assert.deepEqual(parseFunctions("pub fn run() {\n    go();\n}\nfn go() {}\n", "rs").map((d) => d.name), ["run", "go"]);
});

test("las llamadas dentro de cadenas y comentarios no cuentan", () => {
  const defs = parseFunctions('function f() {\n  // g()\n  const s = "h()";\n  k();\n}\n', "js");
  assert.deepEqual(defs[0].calls, ["k"]);
});

test("enclosing devuelve la función más interna", () => {
  const defs = parseFunctions(ts, "ts");
  assert.equal(enclosing(defs, 7)?.name, "run");
  assert.equal(enclosing(defs, 13)?.name, "save");
  assert.equal(enclosing(defs, 4), undefined);
});

test("buildGraph une archivos: quién llama a helper y a quién llama", () => {
  const a = parseFunctions(ts, "ts").map((d): FnInfo => ({ ...d, file: "a.ts" }));
  const b = parseFunctions("function cli() {\n  main();\n}\n", "ts").map((d): FnInfo => ({ ...d, file: "b.ts" }));
  const index = [...a, ...b];
  const helper = index.find((f) => f.name === "helper")!;
  const { callers, callees } = buildGraph(index, helper);
  assert.deepEqual(callers.map((c) => c.name).sort(), ["run", "save"]);
  const run = callers.find((c) => c.name === "run")!;
  assert.deepEqual(run.children.map((c) => c.name), ["main"]);
  assert.deepEqual(run.children[0].children.map((c) => [c.name, c.file]), [["cli", "b.ts"]]);
  assert.equal(callees.length, 0);
  const main = index.find((f) => f.name === "main")!;
  assert.deepEqual(buildGraph(index, main).callees.map((c) => c.name), ["run"]);
});

test("buildGraph marca la recursión", () => {
  const index = parseFunctions("function a() {\n  b();\n}\nfunction b() {\n  a();\n}\n", "js").map((d): FnInfo => ({ ...d, file: "x.js" }));
  const { callers } = buildGraph(index, index[0]);
  assert.equal(callers[0].name, "b");
  assert.equal(callers[0].children[0].flag, "cycle");
});

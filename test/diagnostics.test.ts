import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCode } from "../src/core/apply";
import { contextSnippet, diagnosticText, pickDiagnostic } from "../src/core/diagnostics";

const lines = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);

test("contextSnippet marca la línea del error y respeta los bordes", () => {
  const s = contextSnippet(lines, 10, 2).split("\n");
  assert.equal(s.length, 5);
  assert.match(s[2], /^>> 11 \| l11$/);
  assert.equal(contextSnippet(lines, 0, 2).split("\n").length, 3);
  assert.equal(contextSnippet(lines, 29, 2).split("\n").length, 3);
});

test("diagnosticText incluye origen, archivo y línea (1-based)", () => {
  const t = diagnosticText({ message: "boom", line: 4, file: "a.ts", language: "typescript", source: "ts", code: "2304" });
  assert.equal(t, "boom (ts 2304)\nFile: a.ts · line 5 · typescript");
});

test("pickDiagnostic prefiere la línea del cursor y si no, la primera", () => {
  const list = [{ line: 9 }, { line: 3 }];
  assert.deepEqual(pickDiagnostic(list, 9), { line: 9 });
  assert.deepEqual(pickDiagnostic(list, 0), { line: 3 });
  assert.equal(pickDiagnostic([], 0), undefined);
});

test("applyCode reemplaza o inserta", () => {
  assert.equal(applyCode("hola mundo", 5, 10, "VS Code"), "hola VS Code");
  assert.equal(applyCode("ab", 1, 1, "X"), "aXb");
  assert.equal(applyCode("ab", 5, 1, "X"), "abX");
});

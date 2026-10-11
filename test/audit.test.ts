import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRules } from "../src/core/ruleChecks";
import { fileSmells, insideTemplate, removeDebugLines } from "../src/core/smells";

const NOW = new Date("2026-06-01T00:00:00Z");

test("insideTemplate: marca las líneas que son texto de una plantilla multilínea", () => {
  const src = "const a = 1;\nconst t = `\nconsole.log(1);\nvar x\n`;\nconsole.log(2);\nconst s = '`';\nlet q = 1;\n";
  assert.deepEqual(insideTemplate(src), [false, false, true, true, true, false, false, false, false]);
  // Una comilla invertida dentro de un comentario o de un texto no abre nada.
  assert.deepEqual(insideTemplate("// `\nx();\n"), [false, false, false]);
  assert.deepEqual(insideTemplate('const s = "a`b";\nx();\n'), [false, false, false]);
});

test("limpiar y avisar no tocan el texto de plantillas", () => {
  const src = "const tpl = `\nconsole.log('dentro');\ndebugger\n`;\nconsole.log('fuera');\n";
  const r = removeDebugLines(src, "javascript", "a.js");
  assert.equal(r.removed, 1);
  assert.ok(r.text.includes("console.log('dentro');"));
  assert.ok(!r.text.includes("fuera"));
  assert.deepEqual(fileSmells(src, "javascript", "a.js", NOW).map((s) => s.line), [4]);
});

test("reglas: no marcan comentarios de bloque ni plantillas", () => {
  const src = "/**\n * usa == aquí (solo texto)\n */\n/* var a */ let ok = 1;\nconst t = `\nvar x == 1\n`;\nif (a == b) {}\n";
  const v = checkRules(src, "javascript", ["js:no-eqeq", "js:no-var"]);
  assert.deepEqual(v.map((x) => [x.line, x.id]), [[7, "js:no-eqeq"]]);
  // Un solo * al principio de una línea (continuación de comentario) tampoco cuenta.
  assert.equal(checkRules("/*\n * var x\n */", "javascript", ["js:no-var"]).length, 0);
});

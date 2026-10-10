import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanReply, errorRequest, firstCodeBlock, ideaRequest, michiRequest, resolveLanguage } from "../src/core/prompts";
import { languageFromEditor, languageId, validateTools } from "../src/core/registry";
import { TOOLS } from "../src/tools";

test("resolveLanguage: manda el ajuste, luego VS Code y luego el sistema", () => {
  assert.equal(resolveLanguage("fr", "es", {}), "fr");
  assert.equal(resolveLanguage("auto", "es-mx", {}), "es");
  assert.equal(resolveLanguage("auto", "en", { LANG: "es_MX.UTF-8" }), "es");
  assert.equal(resolveLanguage("auto", "en", { LANG: "C" }), "en");
  assert.equal(resolveLanguage("auto", "ja", {}), "en");
});

test("errorRequest incluye el error y, si se da, el código", () => {
  const a = errorRequest("TypeError: x", undefined, "es");
  assert.match(a.user, /<error>\nTypeError: x\n<\/error>/);
  assert.doesNotMatch(a.user, /<code>/);
  assert.match(a.system, /Spanish/);
  assert.match(errorRequest("e", "print(x)", "en").user, /<code>\nprint\(x\)\n<\/code>/);
});

test("ideaRequest pide el lenguaje elegido", () => {
  const r = ideaRequest("sumar dos números", "Python", "es");
  assert.match(r.system, /working Python program/);
  assert.match(r.user, /Language: Python/);
});

test("cleanReply y firstCodeBlock", () => {
  assert.equal(cleanReply("```markdown\nhola\n```"), "hola");
  assert.equal(firstCodeBlock("## Código\n```python\nprint(1)\n```\ntexto"), "print(1)");
  assert.equal(firstCodeBlock("sin código"), undefined);
});

test("lenguajes de VS Code", () => {
  assert.equal(languageFromEditor("javascript"), "JavaScript");
  assert.equal(languageFromEditor("markdown"), "Python");
  assert.equal(languageId("C#"), "csharp");
});

test("las herramientas incluidas son válidas", () => {
  assert.deepEqual(validateTools(TOOLS), []);
  assert.deepEqual(TOOLS.map((t) => t.id), ["understand", "idea-to-code", "pet", "colors", "function-tree"]);
  assert.deepEqual(TOOLS.filter((t) => t.tab === "junior").map((t) => t.id), ["colors", "function-tree"]);
  for (const t of TOOLS.filter((x) => x.request)) {
    assert.equal(t.tab, "starter");
    const values = Object.fromEntries((t.fields ?? []).map((f) => [f.id, "x"]));
    assert.ok(t.request!(values, "es").system.length > 0);
  }
});

test("ideaRequest adapta la petición a HTML, React, CSS y Sass", () => {
  assert.match(ideaRequest("x", "HTML", "es").system, /complete HTML5 page/);
  assert.match(ideaRequest("x", "React", "es").system, /React component \(JSX/);
  assert.match(ideaRequest("x", "CSS", "es").system, /CSS stylesheet/);
  assert.match(ideaRequest("x", "Sass", "es").system, /SCSS syntax/);
  assert.equal(languageId("Sass"), "scss");
  assert.equal(languageId("React"), "javascriptreact");
});

test("michiRequest pide comparaciones con la vida de los gatos y el código", () => {
  const r = michiRequest("for i in range(3): print(i)", "es");
  assert.match(r.system, /cats/);
  assert.match(r.system, /Spanish/);
  assert.match(r.user, /<code>\nfor i in range/);
});

test("«Entender» usa la voz de Michi para errores y para código", () => {
  const t = TOOLS.find((x) => x.id === "understand")!;
  const err = t.request!({ mode: "Un error", text: "TypeError: x", code: "" }, "es");
  assert.match(err.system, /You are Michi/);
  assert.match(err.system, /## Cómo arreglarlo/);
  assert.match(err.user, /<error>/);
  const code = t.request!({ mode: "Un código", text: "print(1)" }, "es");
  assert.match(code.system, /Michi/);
  assert.match(code.user, /<code>\nprint\(1\)/);
  assert.doesNotMatch(errorRequest("e", undefined, "es").system, /Michi/);
});

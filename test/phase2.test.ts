import assert from "node:assert/strict";
import { test } from "node:test";
import { clipRules, RULES_MAX_CHARS, withRules } from "../src/core/rules";
import { fillPrompt, parseSavedPrompts, PROMPTS_TEMPLATE } from "../src/core/savedPrompts";
import { countParams, levelOf, measure, smellsOf } from "../src/core/smells";
import { entropy, isScannable, scanSecrets } from "../src/core/secrets";
import { detectTestFramework } from "../src/core/testing";
import { diffRequest, findingRequest, impactRequest, testsRequest } from "../src/core/prompts";

const req = { system: "S", user: "U", maxTokens: 10, temperature: 0 };

test("reglas de equipo: se añaden al system y se recortan", () => {
  assert.equal(withRules(req, "  \n"), req);
  const r = withRules(req, "- usa comillas simples");
  assert.match(r.system, /^S\n\n/);
  assert.match(r.system, /<team-rules>\n- usa comillas simples\n<\/team-rules>/);
  assert.equal(r.user, "U");
  assert.ok(clipRules("x".repeat(RULES_MAX_CHARS * 2)).length <= RULES_MAX_CHARS + 2);
});

test("prompts guardados: parseo y relleno", () => {
  const ok = parseSavedPrompts(PROMPTS_TEMPLATE);
  assert.equal(ok.error, undefined);
  assert.equal(ok.prompts.length, 2);
  assert.ok(parseSavedPrompts("{").error);
  assert.ok(parseSavedPrompts("{}").error);
  assert.deepEqual(parseSavedPrompts('[{"name":"a","prompt":"b"},{"name":1},{"name":" ","prompt":"x"}]').prompts, [{ name: "a", prompt: "b" }]);
  const v = { selection: "x = $1", file: "a.py", language: "python" };
  assert.equal(fillPrompt("Mira {{file}}: {{selection}}", v), "Mira a.py: x = $1");
  assert.equal(fillPrompt("Revisa", v), "Revisa\n\nx = $1");
  assert.equal(fillPrompt("Revisa", { ...v, selection: " " }), "Revisa");
});

test("métricas: parámetros, anidación, complejidad y smells", () => {
  assert.equal(countParams("function f(a, b = [1, 2], {c, d}) {"), 3);
  assert.equal(countParams("def m(self, a, b):"), 2);
  assert.equal(countParams("const f = () => 1"), 0);
  const simple = measure("function f(a) {\n  return a + 1;\n}");
  assert.deepEqual([simple.lines, simple.params, simple.complexity], [3, 1, 1]);
  assert.equal(levelOf(simple), "low");
  const branches = "function g(a, b, c, d, e, f) {\n" + Array.from({ length: 16 }, (_, i) => `  if (a === ${i} && b) { x(); }`).join("\n") + "\n}";
  const m = measure(branches);
  assert.ok(m.complexity >= 16 && m.params === 6);
  assert.equal(levelOf(m), "high");
  assert.equal(smellsOf("g", m).length, 2);
  const deep = measure("function d() {\n  if (a) {\n    if (b) {\n      if (c) {\n        if (d) {\n          if (e) {\n            go();\n          }\n        }\n      }\n    }\n  }\n}");
  assert.ok(deep.nesting > 4);
  assert.equal(smellsOf("f", simple).length, 0);
});

// Claves de prueba construidas por partes para que no salten otros escáneres.
const aws = "AKIA" + "IOSFODNN7ABCDEFG";
const gh = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";

test("secretos: claves reales sí, marcadores y plantillas no", () => {
  const hits = scanSecrets(`const a = "${aws}";\nconst t = "${gh}";\n-----BEGIN RSA PRIVATE KEY-----`);
  assert.deepEqual(hits.map((h) => [h.rule, h.line]), [["Clave de acceso de AWS", 0], ["Token de GitHub", 1], ["Clave privada", 2]]);
  assert.ok(hits.every((h) => !h.preview.includes(aws.slice(6)) && h.preview.endsWith("••••")));
  assert.equal(scanSecrets('const password = "Zk3$9fQp!2xLm8vR";').length, 1);
  assert.equal(scanSecrets('const password = "your-password-here";').length, 0);
  assert.equal(scanSecrets('token = "process.env.TOKEN_VALUE"').length, 0);
  assert.equal(scanSecrets('const password = "aaaaaaaaaaaaaaaa";').length, 0);
  assert.equal(scanSecrets("const x = 1;").length, 0);
  assert.ok(entropy("abcdefgh") > entropy("aaaaaaaa"));
});

test("secretos: qué archivos se escanean", () => {
  assert.ok(isScannable("src/a.ts") && isScannable(".env"));
  for (const f of [".env.example", "package-lock.json", "node_modules/x/y.js", "logo.png", "yarn.lock"]) assert.ok(!isScannable(f), f);
});

test("framework de tests según el proyecto", () => {
  assert.equal(detectTestFramework("typescript", { packageJson: '{"devDependencies":{"vitest":"1"}}' }), "Vitest");
  assert.equal(detectTestFramework("javascript", { packageJson: '{"devDependencies":{"jest":"1"}}' }), "Jest");
  assert.match(detectTestFramework("typescript", { packageJson: '{"scripts":{"test":"node --test"}}' }), /node:test/);
  assert.equal(detectTestFramework("python", {}), "pytest");
  assert.equal(detectTestFramework("python", { pythonDeps: "unittest" }), "unittest");
  assert.equal(detectTestFramework("java"), "JUnit 5");
});

test("prompts de fase 2 y 3", () => {
  assert.match(diffRequest("diff --git", "es").system, /Descripción para el PR/);
  assert.match(diffRequest("x".repeat(50_000), "es").user, /diff truncated/);
  assert.match(testsRequest("f()", "f", "python", "pytest", "es").system, /unit tests with pytest/);
  const i = impactRequest("f()", "f", ["a.ts:3"], [], "es");
  assert.match(i.user, /- a\.ts:3/);
  assert.match(i.user, /\(none found\)/);
  assert.match(findingRequest("secret", "m", "c", "es").system, /Never print or ask for the secret value/);
  assert.match(findingRequest("smell", "m", "c", "es").system, /Cómo mejorarlo/);
});

test("diff de archivo nuevo y ramas base", async () => {
  const { addedFileDiff, BASE_BRANCHES } = await import("../src/core/diff");
  const d = addedFileDiff("src/a.ts", "uno\ndos\n");
  assert.match(d, /^diff --git a\/src\/a\.ts b\/src\/a\.ts\nnew file mode/);
  assert.match(d, /@@ -0,0 \+1,2 @@\n\+uno\n\+dos\n$/);
  assert.equal(addedFileDiff("x.bin", "a\0b"), "");
  assert.match(addedFileDiff("big.txt", Array.from({ length: 250 }, (_, i) => `l${i}`).join("\n")), /\+… \(50 more lines\)/);
  assert.equal(BASE_BRANCHES[0], "origin/main");
});

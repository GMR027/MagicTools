import assert from "node:assert/strict";
import { test } from "node:test";
import { findRefs, isSafeRef } from "../src/core/checklist";
import { HISTORY_MAX, pushHistory, sanitizeHistory } from "../src/core/history";
import { summarize, summaryMarkdown } from "../src/core/projectSummary";
import { checkRules, parseChecks } from "../src/core/ruleChecks";
import { RULES_TEMPLATE } from "../src/core/rules";
import { envEntries, envExampleBlock, scanSecrets } from "../src/core/secrets";
import { fileSmells, removeDebugLines } from "../src/core/smells";
import { diffRequest, splitFunctionRequest } from "../src/core/prompts";

const NOW = new Date("2026-06-01T00:00:00Z");

test("smells de archivo: console.log, debugger, print y TODO vencido", () => {
  const js = "console.log(x);\n  debugger;\n// console.log(no)\n// TODO 2026-01-01 arreglar\n// TODO 2026-05-25 reciente\n";
  const found = fileSmells(js, "javascript", "src/a.js", NOW);
  assert.deepEqual(found.map((f) => [f.line, f.kind]), [[0, "log"], [1, "debugger"], [3, "todo"]]);
  assert.equal(fileSmells("print('x')\n", "python", "a.py", NOW)[0].kind, "print");
  assert.equal(fileSmells("print('x')\n", "python", "tests/test_a.py", NOW).length, 0);
  assert.equal(fileSmells("console.log(1)", "javascript", "a.test.js", NOW).length, 0);
});

test("limpiar archivo: solo líneas sueltas y equilibradas", () => {
  const src = "a();\r\nconsole.log('x');\r\nconsole.log(\r\n  y,\r\n);\r\ndebugger\r\nb();\r\n";
  const r = removeDebugLines(src, "javascript", "a.js");
  assert.equal(r.removed, 2);
  assert.equal(r.text, "a();\r\nconsole.log(\r\n  y,\r\n);\r\nb();\r\n");
  assert.equal(removeDebugLines("print('a')\nx=1", "python", "a.py").text, "x=1");
  assert.equal(removeDebugLines("print('a')", "python", "test_a.py").removed, 0);
});

test("secretos: JWT y URL con credenciales", () => {
  const jwt = "t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk1234'";
  assert.equal(scanSecrets(jwt)[0]?.rule, "JWT (token de sesión)");
  const url = scanSecrets('db = "postgres://admin:s3cr3tPass@db.internal:5432/app"');
  assert.equal(url[0]?.rule, "URL con usuario y contraseña");
  assert.ok(!url[0].preview.includes("s3cr3t"));
  assert.equal(scanSecrets('db = "postgres://user:password@localhost/app"').length, 0);
  assert.equal(scanSecrets('u = "https://example.com/path"').length, 0);
  const g = scanSecrets('const api_key = "Zx9fQ2mLp7Rt4Vb8Nc1"');
  assert.equal(g[0]?.envName, "API_KEY");
});

test(".env.example: nombres sin valores y sin repetir", () => {
  const hits = scanSecrets('a = "AKIAABCDEFGHIJKLMNOP"\nb = "AKIAQRSTUVWXYZ234567"');
  const entries = envEntries([{ file: "cfg.js", hits }]);
  assert.deepEqual(entries.map((e) => e.name), ["AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID_2"]);
  const block = envExampleBlock(entries);
  assert.match(block, /# encontrado en cfg\.js:1\nAWS_ACCESS_KEY_ID=\n/);
  assert.ok(!/AKIA/.test(block));
  assert.equal(envExampleBlock(entries, "AWS_ACCESS_KEY_ID=\nAWS_ACCESS_KEY_ID_2=\n"), "");
  assert.ok(!envExampleBlock(entries, "export AWS_ACCESS_KEY_ID=x").includes("AWS_ACCESS_KEY_ID=\n#"));
});

test("resumen del proyecto", () => {
  const long = `function big() {\n${"  x();\n".repeat(120)}}\n`;
  const s = summarize([
    { path: "a.js", text: `// TODO: algo\n${long}` },
    { path: "b.py", text: "def f():\n    return 1\n" },
    { path: "README", text: "hola" },
  ]);
  assert.equal(s.files, 3);
  assert.equal(s.todos.length, 1);
  assert.equal(s.functions.high, 1);
  assert.equal(s.debt[0].path, "a.js");
  assert.equal(s.byLanguage[0].ext, "js");
  const md = summaryMarkdown(s);
  assert.match(md, /## TODO \/ FIXME \(1\)/);
  assert.match(md, /`a\.js:1`/);
});

test("reglas con dientes: bloque check y comprobaciones", () => {
  assert.deepEqual(parseChecks("```check\njs:no-var, py:no-print, raro:x\n```"), ["js:no-var", "py:no-print"]);
  assert.deepEqual(parseChecks("sin bloque"), []);
  assert.deepEqual(parseChecks(RULES_TEMPLATE), ["js:no-var", "py:no-print"]);
  const v = checkRules("var a = 1;\nconst b = 'var c';\n// var d\n", "javascript", ["js:no-var"]);
  assert.deepEqual(v.map((x) => x.line), [0]);
  assert.equal(checkRules("var a = 1;", "python", ["js:no-var"]).length, 0);
  assert.equal(checkRules("print(1)", "python", ["py:no-print"]).length, 1);
  assert.equal(checkRules("if (a == b) {}\nif (a === b) {}", "javascript", ["js:no-eqeq"]).length, 1);
  assert.equal(checkRules("# TODO: x", "python", ["any:no-todo"]).length, 1);
});

test("historial: límite, reemplazo y datos dañados", () => {
  let list = pushHistory([], { title: "A", intro: "", text: "1", at: 1 });
  list = pushHistory(list, { title: "B", intro: "", text: "2", at: 2 });
  list = pushHistory(list, { title: "A", intro: "", text: "3", at: 3 });
  assert.deepEqual(list.map((e) => [e.title, e.text]), [["A", "3"], ["B", "2"]]);
  for (let i = 0; i < 30; i++) list = pushHistory(list, { title: `t${i}`, intro: "", text: "", at: i });
  assert.equal(list.length, HISTORY_MAX);
  assert.deepEqual(sanitizeHistory([{ title: 1 }, null, "x"]), []);
  assert.deepEqual(sanitizeHistory("nada"), []);
});

test("checklist: enlaces archivo:línea seguros", () => {
  const text = "- [ ] revisar `src/app.ts:42` y `../x.ts:1` o `/etc/passwd:3` y `README.md:7`";
  assert.deepEqual(findRefs(text).map((r) => [r.path, r.line]), [["src/app.ts", 42], ["README.md", 7]]);
  assert.equal(text.slice(findRefs(text)[0].start, findRefs(text)[0].end), "`src/app.ts:42`");
  assert.ok(!isSafeRef("a/../b.ts"));
});

test("prompts nuevos", () => {
  assert.match(diffRequest("d", "es").system, /src\/app\.ts:42/);
  const r = splitFunctionRequest("function f(){}", "f", "javascript", "es");
  assert.match(r.system, /WITHOUT changing its behaviour/);
  assert.match(r.user, /Function: f \(javascript\)/);
});

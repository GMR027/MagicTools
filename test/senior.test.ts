import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDepGraph, depsMarkdown, findCycles, importSpecs, joinPath, mermaid, resolveImport } from "../src/core/deps";
import { fileComplexity, hotspotsMarkdown, parseNumstat, rankHotspots } from "../src/core/hotspots";
import { complexityRequest, migrateRequest, postmortemRequest, reviewRequest, securityRequest } from "../src/core/prompts";

test("imports de JS/TS y Python", () => {
  const js = `import a from "./a";\nimport { b } from '../b.js'\nimport "./side";\nconst c = require("./c");\nconst d = await import("lodash");\nexport * from "./e";\n`;
  assert.deepEqual(importSpecs(js, "ts").slice(0, 6), ["./a", "../b.js", "./e", "./side", "./c", "lodash"]);
  const py = "from . import x\nfrom .util import y\nimport os, sys\nimport pkg.mod\n";
  assert.deepEqual(importSpecs(py, "py"), [".", ".util", "os", "sys", "pkg.mod"]);
});

test("resolver imports relativos", () => {
  const known = new Set(["src/a.ts", "src/lib/index.ts", "src/b.js", "pkg/mod.py", "pkg/__init__.py", "pkg/util.py"]);
  assert.equal(resolveImport("./lib", "src/a.ts", known, "ts"), "src/lib/index.ts");
  assert.equal(resolveImport("./b.js", "src/a.ts", known, "ts"), "src/b.js");
  assert.equal(resolveImport("../a", "src/lib/index.ts", known, "ts"), "src/a.ts");
  assert.equal(resolveImport("lodash", "src/a.ts", known, "ts"), undefined);
  assert.equal(resolveImport(".util", "pkg/mod.py", known, "py"), "pkg/util.py");
  assert.equal(resolveImport("pkg.util", "main.py", known, "py"), "pkg/util.py");
  assert.equal(resolveImport("..x", "a.py", known, "py"), undefined);
  assert.equal(joinPath("a", "../.."), undefined);
});

test("grafo, ciclos y Mermaid", () => {
  const g = buildDepGraph([
    { path: "a.ts", text: 'import { b } from "./b";\nimport fs from "node:fs";\nimport x from "react";' },
    { path: "b.ts", text: 'import { c } from "./c";' },
    { path: "c.ts", text: 'import { a } from "./a";' },
    { path: "d.ts", text: 'import { a } from "./a";' },
    { path: "README.md", text: "import x from './a'" },
  ]);
  assert.deepEqual([...g.edges.keys()], ["a.ts", "b.ts", "c.ts", "d.ts"]);
  assert.deepEqual(g.external, ["react"]);
  assert.deepEqual(findCycles(g.edges), [["a.ts", "b.ts", "c.ts"]]);
  assert.deepEqual(findCycles(new Map([["a", ["a"]], ["b", []]])), []);
  const m = mermaid(g.edges, findCycles(g.edges));
  assert.match(m.code, /^graph LR/);
  assert.match(m.code, /linkStyle 0,1,2 stroke/);
  assert.equal(m.total, 4);
  const md = depsMarkdown(g);
  assert.match(md, /🔴 `a\.ts` → `b\.ts` → `c\.ts` → `a\.ts`/);
  assert.match(md, /```mermaid/);
});

test("sin ciclos ni dependencias", () => {
  const g = buildDepGraph([{ path: "a.py", text: "import os\nprint(1)" }]);
  assert.match(depsMarkdown(g), /Ninguna\. ¡Bien!/);
  assert.match(depsMarkdown(g), /No encontré dependencias/);
});

test("hotspots: numstat, complejidad y ranking", () => {
  const log = "5\t2\tsrc/a.js\n1\t1\tsrc/a.js\n3\t0\tsrc/b.js\n-\t-\timg.png\n1\t1\tsrc/{x => y}.js\n2\t2\tsrc/c.js\n2\t2\tsrc/c.js\n";
  const ch = parseNumstat(log);
  assert.deepEqual(ch.get("src/a.js"), { commits: 2, churn: 9 });
  assert.ok(!ch.has("img.png"));
  assert.equal(ch.size, 3);
  const cx = new Map([["src/a.js", 10], ["src/b.js", 99], ["src/c.js", 3]]);
  const r = rankHotspots(ch, cx);
  assert.deepEqual(r.map((h) => [h.path, h.score]), [["src/a.js", 20], ["src/c.js", 6]]);
  assert.match(hotspotsMarkdown(r, 12), /\| 1 \| `src\/a\.js` \| 2 \| 9 \| 10 \| 20 \|/);
  assert.match(hotspotsMarkdown([], 12), /No encontré/);
  const complex = "function f(a){\n if(a){}\n if(a&&a){}\n}\n";
  assert.ok(fileComplexity(complex, "js") > 1);
  assert.equal(fileComplexity("x = 1\n", "py"), 1);
});

test("prompts senior", () => {
  assert.match(reviewRequest("c", "f", "ts", "es").system, /## Veredicto/);
  assert.match(securityRequest("c", "f", "ts", "es").system, /OWASP/);
  assert.match(complexityRequest("c", "f", "ts", "es").system, /Big-O/);
  assert.match(migrateRequest("c", "TypeScript", "es").user, /Migrate to: TypeScript/);
  const pm = postmortemRequest("trace", undefined, undefined, "es");
  assert.match(pm.system, /Línea temporal/);
  assert.match(pm.user, /<logs>\n\(none\)/);
});

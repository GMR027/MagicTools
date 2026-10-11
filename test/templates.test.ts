import assert from "node:assert/strict";
import { test } from "node:test";
import { findTemplate, isSafePath, planFiles, previewPaths, slugify, TEMPLATE_GROUPS, TEMPLATES } from "../src/core/templates";

test("slugify da nombres válidos", () => {
  assert.equal(slugify("Mi Proyecto Ñandú!"), "mi-proyecto-nandu");
  assert.equal(slugify("  --  "), "mi-proyecto");
  assert.equal(slugify("a/../b"), "a-b");
});

test("las plantillas tienen ids únicos, grupo válido y los tipos pedidos", () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TEMPLATES) assert.ok(TEMPLATE_GROUPS.includes(t.group), t.id);
  for (const id of ["html-css", "html-sass", "html-css-js", "html-sass-js", "react", "php"]) assert.ok(findTemplate(id), id);
});

test("cada plantilla genera rutas seguras, sin duplicados y con README y .gitignore", () => {
  for (const t of TEMPLATES) {
    const files = planFiles(t, "Mi App");
    const paths = files.map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, `${t.id}: rutas repetidas`);
    assert.ok(paths.includes("README.md") && paths.includes(".gitignore"), t.id);
    for (const f of files) {
      assert.ok(isSafePath(f.path), `${t.id}: ruta insegura ${f.path}`);
      assert.ok(!f.path.includes("{{") && !f.content.includes("{{name}}"), `${t.id}: queda {{name}} en ${f.path}`);
    }
    assert.ok(paths.length >= 4, t.id);
  }
});

test("los JSON generados son válidos y usan el nombre del proyecto", () => {
  for (const t of TEMPLATES) {
    for (const f of planFiles(t, "Mi App")) {
      if (f.path.endsWith(".json")) assert.doesNotThrow(() => JSON.parse(f.content), `${t.id}: ${f.path}`);
    }
  }
  const pkg = JSON.parse(planFiles(findTemplate("react")!, "Mi App").find((f) => f.path === "package.json")!.content);
  assert.equal(pkg.name, "mi-app");
  assert.ok(pkg.dependencies.react);
});

test("las plantillas web enlazan archivos que existen", () => {
  for (const id of ["html-css", "html-sass", "html-css-js", "html-sass-js", "html-bootstrap"]) {
    const files = planFiles(findTemplate(id)!, "x");
    const paths = new Set(files.map((f) => f.path));
    const index = files.find((f) => f.path === "index.html")!.content;
    for (const m of index.matchAll(/(?:href|src)="(src\/[^"]+)"/g)) assert.ok(paths.has(m[1]), `${id}: ${m[1]} no existe`);
  }
});

test("la ruta con {{name}} se rellena (C#) y la vista previa usa un nombre de ejemplo", () => {
  assert.ok(planFiles(findTemplate("csharp")!, "Hola Mundo").some((f) => f.path === "hola-mundo.csproj"));
  assert.ok(previewPaths(findTemplate("csharp")!).includes("mi-proyecto.csproj"));
});

test("isSafePath rechaza rutas peligrosas", () => {
  for (const p of ["/etc/passwd", "../x", "a/../../b", "C:/x", "a\\b", ""]) assert.ok(!isSafePath(p), p);
  assert.ok(isSafePath("src/a.ts"));
});

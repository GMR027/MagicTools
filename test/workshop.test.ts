import assert from "node:assert/strict";
import { test } from "node:test";
import { cssArtRequest, extractSvg, iconRequest, mockDataRequest } from "../src/core/prompts";
import { withRules } from "../src/core/rules";
import { freeFileName, iconBaseName, isWorkshop, kindOf, svgDataUri, workshopLanguageId, workshopRequest } from "../src/core/workshop";
import { TOOLS } from "../src/tools";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#7c3aed"/><path d="M20 32h24" stroke="#fff"/></svg>';

test("extractSvg: SVG válido dentro de un bloque de código", () => {
  const r = extractSvg(`Aquí tienes:\n\`\`\`svg\n${SVG}\n\`\`\`\nListo.`);
  assert.deepEqual(r, { ok: true, svg: SVG });
});

test("extractSvg: añade xmlns y viewBox si faltan", () => {
  const r = extractSvg('<svg width="48" height="24"><rect width="48" height="24"/></svg>');
  assert.ok(r.ok);
  assert.match(r.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 24" width="48"/);
  const bare = extractSvg("<svg><circle r='4'/></svg>");
  assert.ok(bare.ok);
  assert.match(bare.svg, /viewBox="0 0 64 64"/);
  const idem = extractSvg(SVG);
  assert.ok(idem.ok && idem.svg === SVG);
});

test("extractSvg: rechaza scripts, manejadores on*=, recursos externos y DOCTYPE", () => {
  const bad = [
    '<svg viewBox="0 0 64 64"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 64 64"><circle r="4" onclick="alert(1)"/></svg>',
    '<svg viewBox="0 0 64 64" onload="x()"><circle r="4"/></svg>',
    '<svg viewBox="0 0 64 64"><foreignObject><div/></foreignObject></svg>',
    '<svg viewBox="0 0 64 64"><a href="javascript:alert(1)"><circle r="4"/></a></svg>',
    '<svg viewBox="0 0 64 64"><image href="https://evil.example/x.png"/></svg>',
    '<svg viewBox="0 0 64 64"><circle fill="url(https://evil.example/a)"/></svg>',
    '<svg viewBox="0 0 64 64"><!ENTITY x "y"><rect/></svg>',
    '<svg viewBox="0 0 64 64"><animateTransform attributeName="transform"/></svg>',
  ];
  for (const svg of bad) {
    const r = extractSvg("```xml\n" + svg + "\n```");
    assert.equal(r.ok, false, svg);
    assert.equal((r as { reason: string }).reason, "unsafe", svg);
  }
  // Lo que haya antes de <svg> (DOCTYPE, XML) se descarta: solo se conserva el SVG.
  const pre = extractSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]>' + SVG);
  assert.deepEqual(pre, { ok: true, svg: SVG });
  // Las referencias internas (#id) sí valen.
  assert.ok(extractSvg('<svg viewBox="0 0 64 64"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>').ok);
});

test("extractSvg: sin SVG, mal formado o demasiado grande", () => {
  assert.deepEqual(extractSvg("No puedo dibujar eso."), { ok: false, reason: "none" });
  assert.deepEqual(extractSvg("```\nconsole.log(1)\n```"), { ok: false, reason: "none" });
  assert.deepEqual(extractSvg("<svg viewBox='0 0 1 1'><rect/>"), { ok: false, reason: "invalid" });
  assert.deepEqual(extractSvg('<svg viewBox="0 0 64 64 ><rect/></svg>'), { ok: false, reason: "invalid" });
  assert.deepEqual(extractSvg(`<svg viewBox="0 0 64 64">${"<g/>".repeat(6000)}</svg>`), { ok: false, reason: "too-large" });
});

test("prompts del Taller y reglas del equipo aplicadas con withRules", () => {
  const icon = iconRequest("un cohete", "Geométrico", "es");
  assert.match(icon.system, /viewBox="0 0 64 64"/);
  assert.match(icon.system, /at most about 8 shapes/);
  assert.match(icon.system, /simple geometric shapes/);
  assert.match(icon.system, /Visual style: Geométrico/);
  assert.match(icon.user, /un cohete/);
  assert.match(cssArtRequest("loader", "Loader (carga)", "es").system, /prefers-reduced-motion/);
  const data = mockDataRequest("usuarios", 500, "SQL", "es");
  assert.match(data.system, /exactly 200 records in SQL/);
  assert.match(data.system, /CREATE TABLE/);
  assert.match(mockDataRequest("x", 0, "CSV", "es").system, /exactly 10 records in CSV/);
  for (const req of [icon, cssArtRequest("a", "Fondo", "es"), data]) {
    const r = withRules(req, "- usa comillas simples");
    assert.match(r.system, /<team-rules>\n- usa comillas simples\n<\/team-rules>/);
    assert.ok(r.system.startsWith(req.system));
    assert.equal(r.user, req.user);
  }
});

test("workshopRequest elige el prompt según el tipo", () => {
  assert.match(workshopRequest({ kind: "Icono SVG", description: "x" }, "es").system, /vector icons/);
  assert.match(workshopRequest({ kind: "Animación CSS", description: "x" }, "es").system, /pure CSS art/);
  assert.match(workshopRequest({ kind: "Datos de prueba", description: "x", count: "25", format: "CSV" }, "es").system, /exactly 25 records in CSV/);
  assert.match(workshopRequest({ description: "x" }, "es").system, /vector icons/);
  assert.equal(kindOf({ kind: "otra cosa" }), "Icono SVG");
  assert.equal(workshopLanguageId({ kind: "Datos de prueba", format: "JSON" }), "json");
  assert.equal(workshopLanguageId({ kind: "Animación CSS" }), "css");
});

test("nombres libres: nunca pisan un archivo", () => {
  assert.equal(freeFileName(new Set(), "cohete", "svg"), "cohete.svg");
  assert.equal(freeFileName(new Set(["cohete.svg"]), "cohete", "svg"), "cohete-2.svg");
  assert.equal(freeFileName(new Set(["cohete.svg", "cohete-2.svg"]), "Cohete", "svg"), "cohete-3.svg");
  assert.equal(freeFileName(new Set(), "../../etc", "svg"), "etc.svg");
  assert.equal(freeFileName(new Set(), "!!!", "svg"), "icono.svg");
  assert.equal(iconBaseName("Un cohete pequeño con una estrella"), "cohete-pequeno-con");
  assert.equal(iconBaseName("¿?"), "icono");
});

test("data-URI y registro: una herramienta por pestaña", () => {
  assert.equal(Buffer.from(svgDataUri(SVG).split(",")[1], "base64").toString(), SVG);
  const ws = TOOLS.filter((t) => isWorkshop(t.id));
  assert.deepEqual(ws.map((t) => t.tab), ["starter", "junior", "senior"]);
  for (const t of ws) {
    assert.equal(t.widget, "workshop");
    assert.ok(t.request && t.fields?.some((f) => f.id === "description" && !f.optional));
  }
  const ids = (tab: string) => TOOLS.find((t) => t.tab === tab && isWorkshop(t.id))!.fields!.map((f) => f.id);
  assert.deepEqual(ids("starter"), ["kind", "description", "style"]);
  assert.ok(ids("senior").includes("count") && ids("senior").includes("format"));
});

test("cleanReply: quita la valla que envuelve toda la respuesta, pero no el cierre de un bloque final", async () => {
  const { cleanReply, firstCodeBlock } = await import("../src/core/prompts");
  assert.equal(cleanReply("```markdown\n## Hola\ntexto\n```"), "## Hola\ntexto");
  assert.equal(cleanReply("```\n## Hola\n```"), "## Hola");
  assert.equal(cleanReply("```md\n## A\n```js\nx()\n```\n```"), "## A\n```js\nx()\n```");
  const endsWithCode = "## Qué documenté\nx\n## Código\n```js\nfunction f() {}\n```";
  assert.equal(cleanReply(endsWithCode), endsWithCode);
  assert.equal(firstCodeBlock(cleanReply(endsWithCode)), "function f() {}");
  assert.equal(cleanReply("  texto normal \n"), "texto normal");
});

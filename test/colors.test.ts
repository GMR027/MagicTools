import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBlock, slug, upsertBlock } from "../src/core/colors";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractPalette } = require("../media/colors.js") as { extractPalette: (px: number[], n: number) => string[] };

const px = (...c: [number, number, number, number?][]) => c.flatMap(([r, g, b, a = 255]) => [r, g, b, a]);
const repeat = (c: [number, number, number], times: number) => Array.from({ length: times }, () => c);

test("extractPalette separa los colores dominantes, el más frecuente primero", () => {
  const data = px(...repeat([255, 0, 0], 60), ...repeat([0, 0, 255], 30), ...repeat([0, 255, 0], 10));
  assert.deepEqual(extractPalette(data, 3), ["#ff0000", "#0000ff", "#00ff00"]);
});

test("extractPalette ignora los píxeles transparentes y no repite colores", () => {
  const data = px(...repeat([10, 20, 30], 20), [255, 255, 255, 0], [255, 255, 255, 0]);
  assert.deepEqual(extractPalette(data, 5), ["#0a141e"]);
  assert.deepEqual(extractPalette([], 4), []);
});

test("slug normaliza nombres de imagen", () => {
  assert.equal(slug("Mi Paisaje Ñandú.png"), "mi-paisaje-nandu");
  assert.equal(slug("123.jpg"), "img-123");
});

test("renderBlock en CSS y en Sass", () => {
  assert.match(renderBlock("CSS", ["#ff0000", "#00ff00"], "logo.png"), /:root \{\n  --logo-1: #ff0000;\n  --logo-2: #00ff00;\n\}/);
  assert.match(renderBlock("Sass", ["#ff0000"], "logo.png"), /\$logo-1: #ff0000;/);
});

test("upsertBlock crea, añade y reemplaza sin duplicar", () => {
  const a = renderBlock("CSS", ["#111111"], "a.png");
  const b = renderBlock("CSS", ["#222222"], "b.png");
  let file = upsertBlock(undefined, a, "a.png");
  assert.match(file, /^\/\* Colores extraídos/);
  file = upsertBlock(file, b, "b.png");
  assert.ok(file.includes("#111111") && file.includes("#222222"));
  file = upsertBlock(file, renderBlock("CSS", ["#333333"], "a.png"), "a.png");
  assert.ok(!file.includes("#111111") && file.includes("#333333") && file.includes("#222222"));
  assert.equal(file.match(/magictools:colors:a ·/g)?.length, 1);
});

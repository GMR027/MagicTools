// Paleta de colores de una imagen (corte por la mediana). Se usa en el panel y en las pruebas.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MagicToolsColors = factory();
})(typeof self !== "undefined" ? self : this, function () {
  /** @param {number} n */
  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

  /**
   * @param {ArrayLike<number>} rgba píxeles RGBA seguidos (como getImageData)
   * @param {number} count cuántos colores devolver
   * @returns {string[]} colores #rrggbb, del más frecuente al menos
   */
  function extractPalette(rgba, count) {
    /** @type {number[][]} */
    const px = [];
    for (let i = 0; i + 3 < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue; // transparente
      px.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
    if (!px.length) return [];
    let boxes = [px];
    while (boxes.length < count) {
      // Se parte la caja con más píxeles y más variación (las de un solo color no se parten).
      let box;
      let top = 0;
      for (const b of boxes) {
        const score = b.length * range(b).span;
        if (score > top) (top = score), (box = b);
      }
      if (!box) break;
      // Se corta por la mitad del rango del canal más variable, para no mezclar colores lejanos.
      const { channel, lo, hi } = range(box);
      const cut = (lo + hi) / 2;
      const low = box.filter((p) => p[channel] <= cut);
      const high = box.filter((p) => p[channel] > cut);
      boxes = boxes.filter((b) => b !== box).concat([low, high]);
    }
    return boxes
      .sort((a, b) => b.length - a.length)
      .map((b) => {
        const sum = b.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
        return "#" + sum.map((v) => hex2(v / b.length)).join("");
      })
      .filter((c, i, all) => all.indexOf(c) === i);
  }

  /** Canal con más variación dentro de una caja. @param {number[][]} box */
  function range(box) {
    let best = { channel: 0, span: -1, lo: 0, hi: 0 };
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (const p of box) (lo = Math.min(lo, p[c])), (hi = Math.max(hi, p[c]));
      if (hi - lo > best.span) best = { channel: c, span: hi - lo, lo, hi };
    }
    return best;
  }

  return { extractPalette };
});

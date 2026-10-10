export type StyleFormat = "CSS" | "Sass";

export const COLOR_FILES: Record<StyleFormat, string> = {
  CSS: "src/css/colors.css",
  Sass: "src/sass/_colors.scss",
};

/** Nombre corto y seguro para usar en variables: «Mi Paisaje.png» → «mi-paisaje». */
export function slug(imageName: string): string {
  const base = imageName.replace(/\.[^.]+$/, "");
  const s = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(s) ? s : `img-${s}`.replace(/-$/, "");
}

const marker = (name: string) => `magictools:colors:${slug(name)}`;

/** Bloque con las variables de la paleta, delimitado para poder actualizarlo después. */
export function renderBlock(format: StyleFormat, colors: string[], imageName: string): string {
  const s = slug(imageName);
  const body =
    format === "CSS"
      ? [":root {", ...colors.map((c, i) => `  --${s}-${i + 1}: ${c};`), "}"]
      : colors.map((c, i) => `$${s}-${i + 1}: ${c};`);
  return [`/* ${marker(imageName)} · ${imageName} */`, ...body, `/* /${marker(imageName)} */`].join("\n");
}

/** Mete el bloque en el archivo: reemplaza el de la misma imagen si existe o lo añade al final. */
export function upsertBlock(existing: string | undefined, block: string, imageName: string): string {
  const header = "/* Colores extraídos con MagicTools */\n";
  if (!existing?.trim()) return `${header}\n${block}\n`;
  const m = marker(imageName);
  const re = new RegExp(`/\\* ${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ·[^\\n]*\\*/[\\s\\S]*?/\\* /${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\*/`);
  if (re.test(existing)) return existing.replace(re, () => block);
  return `${existing.replace(/\s+$/, "")}\n\n${block}\n`;
}

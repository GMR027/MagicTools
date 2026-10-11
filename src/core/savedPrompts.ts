/** Prompts guardados: `.magictools/prompts.json` con [{ "name": "...", "prompt": "... {{selection}} ..." }]. */
export const PROMPTS_FILE = ".magictools/prompts.json";

export interface SavedPrompt {
  name: string;
  prompt: string;
}

export const PROMPTS_TEMPLATE = `[
  {
    "name": "Revisar seguridad",
    "prompt": "Revisa este código buscando fallos de seguridad y dime cómo arreglarlos:\\n{{selection}}"
  },
  {
    "name": "Añadir comentarios",
    "prompt": "Añade comentarios breves que expliquen el porqué de cada paso. Archivo: {{file}} ({{language}})\\n{{selection}}"
  }
]
`;

export function parseSavedPrompts(text: string): { prompts: SavedPrompt[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { prompts: [], error: `JSON no válido (${(err as Error).message})` };
  }
  if (!Array.isArray(data)) return { prompts: [], error: "Debe ser una lista: [ { \"name\": …, \"prompt\": … } ]" };
  const prompts: SavedPrompt[] = [];
  for (const item of data) {
    const o = item as Record<string, unknown>;
    if (typeof o?.name === "string" && typeof o?.prompt === "string" && o.name.trim() && o.prompt.trim()) prompts.push({ name: o.name.trim().slice(0, 80), prompt: o.prompt });
  }
  return { prompts };
}

/** Rellena {{selection}}, {{file}} y {{language}}; si el prompt no usa {{selection}}, el código se añade al final. */
export function fillPrompt(template: string, v: { selection: string; file: string; language: string }): string {
  const hasSel = template.includes("{{selection}}");
  const out = template
    .replaceAll("{{file}}", v.file)
    .replaceAll("{{language}}", v.language)
    .replaceAll("{{selection}}", () => v.selection);
  return hasSel || !v.selection.trim() ? out : `${out}\n\n${v.selection}`;
}

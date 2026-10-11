import { cssArtRequest, DATA_FORMATS, iconRequest, mockDataRequest, CSS_KINDS, ICON_STYLES } from "./prompts";
import type { ChatRequest } from "./types";

/** El Taller es una herramienta por pestaña; estos son sus ids (para activarlos o desactivarlos juntos). */
export const WORKSHOP_IDS = ["workshop-starter", "workshop-junior", "workshop-senior"] as const;
export const isWorkshop = (id: string): boolean => (WORKSHOP_IDS as readonly string[]).includes(id);

export const WORKSHOP_KINDS = ["Icono SVG", "Animación CSS", "Datos de prueba"] as const;
export type WorkshopKind = (typeof WORKSHOP_KINDS)[number];

export const COUNTS = ["5", "10", "25", "50", "100"] as const;

export const kindOf = (v: Record<string, string>): WorkshopKind => (WORKSHOP_KINDS as readonly string[]).includes(v.kind) ? (v.kind as WorkshopKind) : WORKSHOP_KINDS[0];

/** La petición de IA según el tipo elegido en el formulario. */
export function workshopRequest(v: Record<string, string>, lang: string): ChatRequest {
  const description = v.description ?? "";
  switch (kindOf(v)) {
    case "Animación CSS":
      return cssArtRequest(description, v.csstype || "Animación", lang);
    case "Datos de prueba":
      return mockDataRequest(description, Number(v.count) || 10, v.format || DATA_FORMATS[0], lang);
    default:
      return iconRequest(description, v.style || ICON_STYLES[0], lang);
  }
}

/** Id de lenguaje de VS Code para abrir el resultado en un archivo. */
export function workshopLanguageId(v: Record<string, string>): string {
  switch (kindOf(v)) {
    case "Animación CSS": return "css";
    case "Datos de prueba": return { JSON: "json", CSV: "csv", SQL: "sql" }[v.format as "JSON"] ?? "plaintext";
    default: return "xml";
  }
}

/** Primer nombre libre «base.ext», «base-2.ext»… que no esté en `taken`. */
export function freeFileName(taken: ReadonlySet<string>, base: string, ext: string): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "icono";
  for (let i = 1; ; i++) {
    const name = i === 1 ? `${clean}.${ext}` : `${clean}-${i}.${ext}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** Nombre sugerido para un icono a partir de lo que el usuario describió. */
export function iconBaseName(description: string): string {
  const words = description.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return words.slice(0, 3).join("-") || "icono";
}

/** SVG ya validado → data-URI para un <img> (un <img> no ejecuta scripts). */
export const svgDataUri = (svg: string): string => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

export const PET_ICON_FILE = ".magictools/pet-icon.svg";
export const ASSETS_DIR = "assets";

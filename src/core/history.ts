/** Última respuesta de cada herramienta con IA, para volver a verla sin gastar tokens. */
export interface HistoryEntry {
  title: string;
  intro: string;
  text: string;
  at: number;
}

export const HISTORY_MAX = 12;
export const HISTORY_KEY = "magictools.history";

/** Añade una entrada al principio; una nueva con el mismo título reemplaza a la anterior. */
export function pushHistory(list: readonly HistoryEntry[], entry: HistoryEntry, max = HISTORY_MAX): HistoryEntry[] {
  return [entry, ...list.filter((e) => e.title !== entry.title || e.intro !== entry.intro)].slice(0, max);
}

/** Lo guardado puede venir de otra versión o estar dañado: solo se aceptan entradas completas. */
export function sanitizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is HistoryEntry => !!e && typeof e.title === "string" && typeof e.text === "string" && typeof e.intro === "string" && typeof e.at === "number")
    .slice(0, HISTORY_MAX);
}

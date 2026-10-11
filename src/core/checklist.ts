/** Referencias «archivo:línea» escritas entre comillas invertidas (p. ej. `src/app.ts:42`) en una respuesta. */
export interface FileRef {
  /** Posición del texto completo (con las comillas) dentro del documento. */
  start: number;
  end: number;
  path: string;
  /** 1-based. */
  line: number;
}

const REF = /`((?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,8}):(\d{1,6})`/g;

/** Rutas relativas y seguras: nada de «..» ni rutas absolutas. */
export const isSafeRef = (p: string): boolean => !p.startsWith("/") && !p.split("/").includes("..");

export function findRefs(text: string): FileRef[] {
  const out: FileRef[] = [];
  for (const m of text.matchAll(REF)) {
    if (!isSafeRef(m[1])) continue;
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, path: m[1], line: Number(m[2]) });
  }
  return out;
}

/** Marca (comentario HTML invisible) que identifica los documentos cuyos enlaces activa MagicTools. */
export const LINKS_MARK = "<!-- magictools:links -->";

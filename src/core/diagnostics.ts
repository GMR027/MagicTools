/** Lo que se le manda a la IA de un error del editor: mensaje, línea y unas líneas de contexto. */
export interface DiagnosticInfo {
  message: string;
  /** Línea del error (0-based). */
  line: number;
  file: string;
  language: string;
  /** Quién lo reporta (ts, eslint, pylance…). */
  source?: string;
  code?: string;
}

/** Líneas de contexto alrededor del error (a cada lado). */
export const CONTEXT_RADIUS = 7;

/** Fragmento de código con números de línea y una marca «>>» en la línea del error. */
export function contextSnippet(lines: readonly string[], line: number, radius = CONTEXT_RADIUS): string {
  const from = Math.max(0, line - radius);
  const to = Math.min(lines.length - 1, line + radius);
  const width = String(to + 1).length;
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${i === line ? ">>" : "  "} ${String(i + 1).padStart(width)} | ${lines[i]}`);
  return out.join("\n");
}

/** Texto del error para «Traducir error»: mensaje + dónde + contexto. */
export function diagnosticText(d: DiagnosticInfo): string {
  const origin = [d.source, d.code].filter(Boolean).join(" ");
  return `${d.message}${origin ? ` (${origin})` : ""}\nFile: ${d.file} · line ${d.line + 1} · ${d.language}`;
}

/** Elige el error a explicar: el de la línea del cursor o, si no hay, el primero del archivo. */
export function pickDiagnostic<T extends { line: number }>(list: readonly T[], cursorLine: number): T | undefined {
  return list.find((d) => d.line === cursorLine) ?? [...list].sort((a, b) => a.line - b.line)[0];
}

import { LIMITS, levelOf, measure, smellsOf } from "./smells";
import { parseFunctions } from "./callgraph";

/** Un archivo ya leído. */
export interface SummaryFile {
  path: string;
  text: string;
}

export interface ProjectSummary {
  files: number;
  lines: number;
  byLanguage: { ext: string; files: number; lines: number }[];
  todos: { path: string; line: number; text: string }[];
  bigFiles: { path: string; lines: number }[];
  functions: { low: number; medium: number; high: number };
  /** Archivos con más avisos de funciones raras. */
  debt: { path: string; smells: number }[];
}

export const BIG_FILE_LINES = 500;
const CODE_EXT = new Set(["js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "go", "rs", "php", "c", "cpp", "cs", "rb"]);

const extOf = (path: string) => (path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "(sin extensión)");

export function summarize(files: SummaryFile[]): ProjectSummary {
  const lang = new Map<string, { files: number; lines: number }>();
  const out: ProjectSummary = { files: files.length, lines: 0, byLanguage: [], todos: [], bigFiles: [], functions: { low: 0, medium: 0, high: 0 }, debt: [] };
  for (const f of files) {
    const rows = f.text.split(/\r?\n/);
    const ext = extOf(f.path);
    const l = lang.get(ext) ?? { files: 0, lines: 0 };
    lang.set(ext, { files: l.files + 1, lines: l.lines + rows.length });
    out.lines += rows.length;
    if (rows.length > BIG_FILE_LINES) out.bigFiles.push({ path: f.path, lines: rows.length });
    rows.forEach((row, i) => {
      if (row.length < 400 && /\b(?:TODO|FIXME)\b/.test(row)) out.todos.push({ path: f.path, line: i + 1, text: row.trim().slice(0, 100) });
    });
    if (!CODE_EXT.has(ext)) continue;
    let smells = 0;
    for (const fn of parseFunctions(f.text, ext)) {
      const m = measure(rows.slice(fn.line, fn.end + 1).join("\n"));
      out.functions[levelOf(m)]++;
      smells += smellsOf(fn.name, m).length;
    }
    if (smells) out.debt.push({ path: f.path, smells });
  }
  out.byLanguage = [...lang].map(([ext, v]) => ({ ext, ...v })).sort((a, b) => b.lines - a.lines);
  out.bigFiles.sort((a, b) => b.lines - a.lines);
  out.debt.sort((a, b) => b.smells - a.smells);
  return out;
}

/** Informe en Markdown (sin IA). */
export function summaryMarkdown(s: ProjectSummary, truncated = false): string {
  const top = <T,>(list: T[], n: number) => list.slice(0, n);
  const out: string[] = [];
  out.push(`${s.files} archivos de texto · ${s.lines.toLocaleString("es")} líneas${truncated ? " _(solo se revisaron los primeros; el proyecto es más grande)_" : ""}.`);
  out.push("", "## Por lenguaje", "", "| Tipo | Archivos | Líneas |", "|---|---:|---:|");
  for (const l of top(s.byLanguage, 10)) out.push(`| .${l.ext.replace(/^\(.*\)$/, "—")} | ${l.files} | ${l.lines} |`);
  const total = s.functions.low + s.functions.medium + s.functions.high;
  out.push("", "## Funciones", "");
  out.push(total ? `${total} funciones: ${s.functions.low} sencillas · ${s.functions.medium} medianas · ${s.functions.high} complicadas (más de ${LIMITS.lines * 2} líneas o complejidad ≥ ${LIMITS.complexity}).` : "No encontré funciones.");
  out.push("", `## Deuda por archivo (funciones raras)`, "");
  out.push(...(s.debt.length ? top(s.debt, 10).map((d) => `- \`${d.path}\` — ${d.smells} aviso(s)`) : ["Ninguna. ¡Bien!"]));
  out.push("", `## Archivos grandes (más de ${BIG_FILE_LINES} líneas)`, "");
  out.push(...(s.bigFiles.length ? top(s.bigFiles, 10).map((b) => `- \`${b.path}\` — ${b.lines} líneas`) : ["Ninguno."]));
  out.push("", `## TODO / FIXME (${s.todos.length})`, "");
  out.push(...(s.todos.length ? top(s.todos, 15).map((t) => `- \`${t.path}:${t.line}\` ${t.text}`) : ["Ninguno."]));
  if (s.todos.length > 15) out.push(`- … y ${s.todos.length - 15} más`);
  return out.join("\n");
}

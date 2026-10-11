/** Métricas locales (sin IA) de una función; sirven para colorear el árbol y para los code smells. */
export interface FnMetrics {
  lines: number;
  params: number;
  nesting: number;
  complexity: number;
}

export const LIMITS = { lines: 50, params: 5, nesting: 4, complexity: 15 } as const;

export type Level = "low" | "medium" | "high";

/** Quita comentarios de línea y el contenido de los textos entre comillas (aproximado, para contar). */
function strip(line: string): string {
  return line
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')
    .replace(/\s(?:\/\/|#).*$/, "")
    .replace(/^\s*(?:\/\/|#|\*|\/\*).*$/, "");
}

const BRANCH = /\b(?:if|elif|for|foreach|while|case|catch|except|when)\b|&&|\|\||\band\b|\bor\b/g;

/** Parámetros de la cabecera: lo que hay entre el primer paréntesis y su pareja (ignora self/this). */
export function countParams(header: string): number {
  const start = header.indexOf("(");
  if (start < 0) return 0;
  let depth = 0;
  let cur = "";
  const parts: string[] = [];
  for (let i = start + 1; i < header.length; i++) {
    const ch = header[i];
    if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch)) {
      if (ch === ")" && depth === 0) break;
      depth--;
    }
    if (ch === "," && depth === 0) (parts.push(cur), (cur = ""));
    else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p && !/^(?:self|cls|this)\b/.test(p)).length;
}

export function measure(code: string): FnMetrics {
  const all = code.replace(/\t/g, "    ").split(/\r?\n/);
  const body = all.filter((l) => l.trim());
  const indents = body.map((l) => l.length - l.trimStart().length);
  const base = indents[0] ?? 0;
  const steps = [...new Set(indents)].sort((a, b) => a - b).map((v, i, a) => (i ? v - a[i - 1] : 0)).filter((d) => d > 0);
  const unit = steps.length ? Math.min(...steps) : 4;
  const nesting = indents.length ? Math.max(0, Math.round((Math.max(...indents) - base) / unit) - 1) : 0;
  const header = all.slice(0, 4).join(" ");
  let complexity = 1;
  for (const l of body) complexity += strip(l).match(BRANCH)?.length ?? 0;
  return { lines: body.length, params: countParams(header), nesting, complexity };
}

export function levelOf(m: FnMetrics): Level {
  if (m.complexity >= LIMITS.complexity || m.lines > LIMITS.lines * 2) return "high";
  if (m.complexity >= 8 || m.lines > LIMITS.lines || m.nesting > LIMITS.nesting) return "medium";
  return "low";
}

/** Cosas raras de una función, en lenguaje amable. */
export function smellsOf(name: string, m: FnMetrics): string[] {
  const out: string[] = [];
  if (m.lines > LIMITS.lines) out.push(`«${name}» es larga (${m.lines} líneas): quizá hace más de una cosa.`);
  if (m.params > LIMITS.params) out.push(`«${name}» recibe ${m.params} parámetros: agruparlos en un objeto la haría más fácil de usar.`);
  if (m.nesting > LIMITS.nesting) out.push(`«${name}» tiene ${m.nesting} niveles de anidación: cuesta seguirla.`);
  if (m.complexity >= LIMITS.complexity) out.push(`«${name}» tiene muchos caminos posibles (complejidad ${m.complexity}): será difícil de probar.`);
  return out;
}

/** Un aviso a nivel de archivo (no de función). */
export interface LineSmell {
  /** 0-based. */
  line: number;
  column: number;
  length: number;
  message: string;
  kind: "log" | "debugger" | "print" | "todo";
}

/** Por cada línea: ¿empieza dentro de un texto de plantilla (`...` de varias líneas)? Aproximado, para no tocar código que solo es texto. */
export function insideTemplate(text: string): boolean[] {
  let open = false;
  return text.split(/\r?\n/).map((line) => {
    const starts = open;
    const bare = line
      .replace(/\\./g, "")
      .replace(/'[^'\n]*'|"[^"\n]*"/g, "")
      .replace(/\/\/.*$/, "");
    if (((bare.match(/`/g) ?? []).length & 1) === 1) open = !open;
    return starts;
  });
}

const DAY = 86_400_000;
export const TODO_MAX_DAYS = 30;

const isPython = (languageId: string) => languageId === "python";
const isJsLike = (languageId: string) => /^(?:javascript|typescript|javascriptreact|typescriptreact|vue|svelte)$/.test(languageId);
export const isTestPath = (path: string) => /(^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.py$/i.test(path);

/** Fecha (AAAA-MM-DD) escrita junto a un TODO/FIXME, si la hay. */
function todoDate(line: string): Date | undefined {
  const m = line.match(/\b(?:TODO|FIXME)\b.*?(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Cosas olvidadas en el archivo: console.log, debugger, print() fuera de tests y TODO con fecha vencida. Sin IA. */
export function fileSmells(text: string, languageId: string, path: string, now: Date = new Date()): LineSmell[] {
  const out: LineSmell[] = [];
  const test = isTestPath(path);
  const inTpl = isJsLike(languageId) ? insideTemplate(text) : [];
  text.split(/\r?\n/).forEach((raw, line) => {
    if (raw.length > 2000 || inTpl[line]) return;
    const trimmed = raw.trim();
    const column = raw.length - raw.trimStart().length;
    const add = (kind: LineSmell["kind"], message: string) => out.push({ line, column, length: trimmed.length, message, kind });
    const comment = /^(?:\/\/|#|\*|\/\*)/.test(trimmed);
    if (!comment && isJsLike(languageId) && !test) {
      if (/\bconsole\.(?:log|debug)\s*\(/.test(strip(raw))) add("log", "Un console.log olvidado: ¿se quedó de cuando probabas?");
      if (/^debugger\s*;?$/.test(trimmed)) add("debugger", "Un «debugger» olvidado: detendrá el programa si alguien abre las herramientas del navegador.");
    }
    if (!comment && isPython(languageId) && !test && /^print\s*\(/.test(trimmed)) add("print", "Un print() olvidado: en código final suele ser mejor usar logging.");
    const date = todoDate(raw);
    if (date && now.getTime() - date.getTime() > TODO_MAX_DAYS * DAY) {
      add("todo", `Este TODO es del ${date.toISOString().slice(0, 10)} (hace más de ${TODO_MAX_DAYS} días): hazlo o bórralo.`);
    }
  });
  return out;
}

/** Quita las líneas «sueltas» de depuración (console.log/debug de una línea, debugger, print) y dice cuántas quitó. */
export function removeDebugLines(text: string, languageId: string, path: string): { text: string; removed: number } {
  if (isTestPath(path)) return { text, removed: 0 };
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const inTpl = isJsLike(languageId) ? insideTemplate(text) : [];
  let removed = 0;
  const kept = text.split(/\r?\n/).filter((l, i) => {
    if (inTpl[i]) return true;
    const t = l.trim();
    const drop =
      (isJsLike(languageId) && (/^console\.(?:log|debug)\(.*\)\s*;?$/.test(t) || /^debugger\s*;?$/.test(t))) ||
      (isPython(languageId) && /^print\(.*\)$/.test(t));
    if (drop && balanced(t)) removed++;
    return !(drop && balanced(t));
  });
  return { text: kept.join(nl), removed };
}

/** Paréntesis equilibrados en la línea (para no cortar a medias una llamada de varias líneas). */
function balanced(t: string): boolean {
  let d = 0;
  for (const ch of t.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')) {
    if (ch === "(") d++;
    else if (ch === ")" && --d < 0) return false;
  }
  return d === 0;
}

import { insideTemplate } from "./smells";

/** «Reglas con dientes»: comprobaciones locales (sin IA) que se activan con un bloque ```check en rules.md. */
export interface RuleCheck {
  id: string;
  /** Qué lenguajes revisa (ids de VS Code). Vacío = todos. */
  languages: string[];
  re: RegExp;
  message: string;
}

const JS = ["javascript", "typescript", "javascriptreact", "typescriptreact", "vue", "svelte"];

export const RULE_CHECKS: RuleCheck[] = [
  { id: "js:no-var", languages: JS, re: /^\s*(?:export\s+)?var\s+\w/, message: "Regla del equipo: no usar «var» (usa const o let)." },
  { id: "js:no-console", languages: JS, re: /\bconsole\.(?:log|debug|info)\s*\(/, message: "Regla del equipo: nada de console.log en el código." },
  { id: "js:no-eqeq", languages: JS, re: /[^=!<>]==(?!=)|!=(?!=)/, message: "Regla del equipo: usa === y !== en vez de == y !=." },
  { id: "js:no-debugger", languages: JS, re: /^\s*debugger\s*;?\s*$/, message: "Regla del equipo: no dejar «debugger»." },
  { id: "py:no-print", languages: ["python"], re: /^\s*print\s*\(/, message: "Regla del equipo: no usar print() (usa logging)." },
  { id: "py:no-bare-except", languages: ["python"], re: /^\s*except\s*:/, message: "Regla del equipo: no usar «except:» sin tipo de error." },
  { id: "any:no-todo", languages: [], re: /\b(?:TODO|FIXME)\b/, message: "Regla del equipo: no dejar TODO/FIXME en el código." },
];

export interface RuleViolation {
  /** 0-based. */
  line: number;
  column: number;
  length: number;
  id: string;
  message: string;
}

/** Ids pedidos en los bloques ```check de rules.md (se ignoran los desconocidos). */
export function parseChecks(rules: string | undefined): string[] {
  const known = new Set(RULE_CHECKS.map((r) => r.id));
  const ids = new Set<string>();
  for (const block of (rules ?? "").matchAll(/```[ \t]*check[^\n]*\n([\s\S]*?)```/g)) {
    for (const id of block[1].split(/[\s,]+/)) if (known.has(id.trim())) ids.add(id.trim());
  }
  return [...ids];
}

/** Quita comentarios y el contenido de textos para no marcar lo que no es código (aproximado). */
const code = (line: string) =>
  line
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')
    .replace(/\/\*.*?\*\//g, "")
    .replace(/^\s*(?:\/\*.*|\*.*)$/, "")
    .replace(/(?:^|\s)(?:\/\/|#).*$/, "");

export function checkRules(text: string, languageId: string, ids: string[]): RuleViolation[] {
  const active = RULE_CHECKS.filter((r) => ids.includes(r.id) && (!r.languages.length || r.languages.includes(languageId)));
  if (!active.length) return [];
  const out: RuleViolation[] = [];
  const inTpl = JS.includes(languageId) ? insideTemplate(text) : [];
  text.split(/\r?\n/).forEach((raw, line) => {
    if (raw.length > 2000 || inTpl[line]) return;
    for (const r of active) {
      // El TODO vive en comentarios: se busca en la línea entera; lo demás, solo en código.
      const subject = r.id === "any:no-todo" ? raw : code(raw);
      if (!r.re.test(subject)) continue;
      const first = raw.length - raw.trimStart().length;
      out.push({ line, column: first, length: raw.trim().length, id: r.id, message: r.message });
    }
  });
  return out;
}

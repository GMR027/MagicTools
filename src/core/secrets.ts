/** Detección local de secretos (sin IA ni red). Solo lo grave: claves reales y asignaciones sospechosas. */
export interface SecretHit {
  rule: string;
  /** 0-based. */
  line: number;
  column: number;
  length: number;
  /** Valor enmascarado, nunca el secreto completo. */
  preview: string;
  /** Nombre sugerido para una variable de entorno (p. ej. ANTHROPIC_API_KEY). */
  envName: string;
}

const SPECIFIC: { rule: string; env: string; re: RegExp }[] = [
  { rule: "Clave privada", env: "PRIVATE_KEY", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { rule: "Clave de Anthropic", env: "ANTHROPIC_API_KEY", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { rule: "Clave de OpenAI", env: "OPENAI_API_KEY", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { rule: "Token de GitHub", env: "GITHUB_TOKEN", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g },
  { rule: "Clave de acceso de AWS", env: "AWS_ACCESS_KEY_ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { rule: "Token de Slack", env: "SLACK_TOKEN", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { rule: "Clave de Google", env: "GOOGLE_API_KEY", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { rule: "Clave de Stripe", env: "STRIPE_SECRET_KEY", re: /\b[sr]k_live_[0-9A-Za-z]{20,}/g },
  { rule: "JWT (token de sesión)", env: "JWT_TOKEN", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { rule: "URL con usuario y contraseña", env: "DATABASE_URL", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/"'`]+:(?![^@\s"'`]*(?:example|your|changeme|placeholder|xxxx|<|\$\{|password))[^\s@/"'`]{3,}@[^\s"'`]+/gi },
];

const GENERIC = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|token)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi;
const PLACEHOLDER = /example|your|changeme|placeholder|xxxx|\*{3,}|<[^>]+>|\$\{|process\.env|os\.environ|getenv|dummy|sample|test/i;

export function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

export const mask = (v: string): string => (v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••`);

/** Archivos que no se escanean (plantillas, dependencias, binarios y bloqueos). */
export function isScannable(path: string): boolean {
  if (/(^|\/)(node_modules|\.git|dist|build|out|vendor|\.venv|venv)\//.test(path)) return false;
  if (/\.(?:lock|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|vsix|map|min\.js)$/i.test(path)) return false;
  return !/(^|\/)(?:package-lock\.json|\.env\.(?:example|sample|template))$/.test(path);
}

export function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.length > 2000) return;
    const taken: [number, number][] = [];
    const overlaps = (a: number, b: number) => taken.some(([s, e]) => a < e && b > s);
    for (const { rule, env, re } of SPECIFIC) {
      for (const m of line.matchAll(re)) {
        const at = m.index ?? 0;
        if (overlaps(at, at + m[0].length)) continue;
        taken.push([at, at + m[0].length]);
        hits.push({ rule, line: i, column: at, length: m[0].length, preview: mask(m[0]), envName: env });
      }
    }
    for (const m of line.matchAll(GENERIC)) {
      const value = m[2];
      const at = (m.index ?? 0) + m[0].indexOf(value);
      if (overlaps(at, at + value.length) || PLACEHOLDER.test(value) || entropy(value) < 3.2) continue;
      hits.push({ rule: "Contraseña o token en el código", line: i, column: at, length: value.length, preview: mask(value), envName: envNameOf(m[1]) });
    }
  });
  return hits;
}

/** «api-key» → API_KEY. */
const envNameOf = (key: string): string => key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/** Una variable para el .env.example: nunca lleva el valor real. */
export interface EnvEntry {
  name: string;
  file: string;
  /** 1-based. */
  line: number;
}

/** Variables únicas (con «_2», «_3»… si se repiten) a partir de los hallazgos de varios archivos. */
export function envEntries(found: { file: string; hits: SecretHit[] }[]): EnvEntry[] {
  const count = new Map<string, number>();
  const out: EnvEntry[] = [];
  for (const { file, hits } of found) {
    for (const h of hits) {
      const n = (count.get(h.envName) ?? 0) + 1;
      count.set(h.envName, n);
      out.push({ name: n === 1 ? h.envName : `${h.envName}_${n}`, file, line: h.line + 1 });
    }
  }
  return out;
}

/** Contenido para añadir a un .env.example (solo los nombres que aún no están). Vacío si no hay nada nuevo. */
export function envExampleBlock(entries: EnvEntry[], existing = ""): string {
  const have = new Set([...existing.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1]));
  const lines = entries.filter((e) => !have.has(e.name)).map((e) => `# encontrado en ${e.file}:${e.line}\n${e.name}=`);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

import type { CallNode } from "./tree";

/** Una función encontrada en un archivo (análisis por texto, sirve para cualquier lenguaje). */
export interface FnDef {
  name: string;
  /** Línea donde empieza (0-based) y donde termina (incluida). */
  line: number;
  end: number;
  /** Nombres de funciones que se llaman dentro de su cuerpo. */
  calls: string[];
}

/** Función de un archivo concreto del proyecto. */
export interface FnInfo extends FnDef {
  file: string;
}

const KEYWORDS = new Set([
  "if", "for", "foreach", "while", "switch", "catch", "return", "function", "def", "fn", "func", "fun", "new", "else", "elif", "do", "try", "typeof", "sizeof",
  "await", "async", "throw", "echo", "print", "isset", "empty", "unset", "array", "list", "match", "when", "with", "assert", "lambda", "super", "this", "self",
  "require", "include", "import", "from", "and", "or", "not", "in", "is", "case", "default", "yield", "delete", "void", "int", "string", "bool", "var", "let", "const",
]);

const ID = String.raw`[A-Za-z_$][\w$]*`;
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`^\s*(?:async\s+)?def\s+(?:self\.)?(${ID}[?!]?)\s*(?:\(|$)`), // Python, Ruby
  new RegExp(String.raw`\bfunction\s*\*?\s*&?\s*(${ID})\s*\(`), // JS, TS, PHP
  new RegExp(String.raw`^\s*(?:export\s+)?(?:const|let|var)\s+(${ID})\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|${ID}\s*=>)`), // flecha
  new RegExp(String.raw`^\s*func\s+(?:\([^)]*\)\s*)?(${ID})\s*[(<]`), // Go
  new RegExp(String.raw`\bfn\s+(${ID})\s*[(<]`), // Rust
  new RegExp(String.raw`\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(${ID})\s*\(`), // Kotlin
  new RegExp(String.raw`\bfunc\s+(${ID})\s*[(<]`), // Swift
  // Métodos de clase JS/TS: «  nombre(args) {»
  new RegExp(String.raw`^\s+(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*(${ID})\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{\s*$`),
  // Java, C#, C, C++: «tipo nombre(args) {»
  new RegExp(String.raw`^\s*(?!(?:return|else|new|throw|await|yield|case|delete|typeof|echo|print|goto|using|namespace)\b)(?:(?:public|private|protected|static|final|abstract|override|virtual|inline|async|unsafe|extern)\s+)*[\w<>\[\],.:*&?]+\s+[*&]*(${ID})\s*\([^;]*\)\s*(?:const\s*)?(?:throws\s+[\w.,\s]+)?\{?\s*$`),
];

const INDENT_BASED = new Set(["py", "rb"]);

const indentOf = (line: string) => /^\s*/.exec(line)![0].replace(/\t/g, "    ").length;

/** Quita comentarios de línea y el contenido de las cadenas (para no contar llaves ni llamadas falsas). */
function stripLine(line: string, ext: string): string {
  let s = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
  s = INDENT_BASED.has(ext) || ext === "sh" ? s.replace(/#.*$/, "") : s.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "").replace(/\/\*.*?\*\//g, "");
  if (ext === "php") s = s.replace(/#.*$/, "");
  return s;
}

/** Busca las funciones de un archivo y a quién llama cada una. `ext` es la extensión sin punto. */
export function parseFunctions(text: string, ext: string): FnDef[] {
  const lines = text.split(/\r?\n/);
  const clean = lines.map((l) => stripLine(l, ext));
  const defs: FnDef[] = [];
  const found: { name: string; line: number }[] = [];
  clean.forEach((l, i) => {
    for (const re of PATTERNS) {
      const m = re.exec(l);
      if (m && !KEYWORDS.has(m[1])) {
        found.push({ name: m[1], line: i });
        break;
      }
    }
  });

  for (const f of found) {
    let end = f.line;
    if (INDENT_BASED.has(ext)) {
      const base = indentOf(lines[f.line]);
      for (let i = f.line + 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        if (indentOf(lines[i]) <= base) break;
        end = i;
      }
    } else {
      let depth = 0;
      let opened = false;
      for (let i = f.line; i < Math.min(clean.length, f.line + 2000); i++) {
        // Sin llave en la primera línea (función flecha de una expresión, prototipo): termina ahí,
        // salvo que la llave vaya en la línea siguiente (estilo Allman de C#, PHP, Go…).
        if (i === f.line + 1 && !opened && !clean[i].trim().startsWith("{")) {
          end = f.line;
          break;
        }
        for (const ch of clean[i]) {
          if (ch === "{") (depth++, (opened = true));
          else if (ch === "}") depth--;
        }
        end = i;
        if (opened && depth <= 0) break;
      }
    }
    const calls = new Set<string>();
    for (let i = f.line; i <= end; i++) {
      const body = i === f.line ? clean[i].replace(new RegExp(String.raw`\b${f.name.replace(/[$]/g, "\\$")}\b`), "") : clean[i];
      for (const m of body.matchAll(new RegExp(String.raw`(${ID})\s*\(`, "g"))) if (!KEYWORDS.has(m[1])) calls.add(m[1]);
    }
    defs.push({ name: f.name, line: f.line, end, calls: [...calls] });
  }
  return defs;
}

/** La función más interna que contiene la línea (0-based). */
export function enclosing(defs: FnDef[], line: number): FnDef | undefined {
  return defs.filter((d) => d.line <= line && line <= d.end).sort((a, b) => b.line - a.line)[0];
}

export const keyOf = (f: FnInfo) => `${f.file}|${f.name}|${f.line}`;
const toNode = (f: FnInfo): CallNode => ({ name: f.name, file: f.file, line: f.line + 1, children: [] });

export interface GraphLimits {
  up: number;
  down: number;
  nodes: number;
}

/** Árboles de quién llama a `target` (hacia arriba) y a quién llama (hacia abajo), por coincidencia de nombres. */
export function buildGraph(index: FnInfo[], target: FnInfo, limits: GraphLimits = { up: 6, down: 3, nodes: 80 }): { callers: CallNode[]; callees: CallNode[] } {
  const byName = new Map<string, FnInfo[]>();
  for (const f of index) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
  const callersOf = new Map<string, FnInfo[]>();
  for (const f of index) for (const c of f.calls) callersOf.set(c, [...(callersOf.get(c) ?? []), f]);

  const walk = (from: FnInfo, next: (f: FnInfo) => FnInfo[], maxDepth: number): CallNode[] => {
    let budget = limits.nodes;
    const go = (f: FnInfo, depth: number, chain: Set<string>): CallNode[] =>
      next(f).map((n) => {
        const node = toNode(n);
        if (chain.has(keyOf(n))) node.flag = "cycle";
        else if (budget <= 0 || depth >= maxDepth) node.flag = "more";
        else {
          budget--;
          node.children = go(n, depth + 1, new Set([...chain, keyOf(n)]));
        }
        return node;
      });
    return go(from, 1, new Set([keyOf(from)]));
  };

  // Con nombres repetidos manda el archivo propio: si quien llama define su propia función con ese
  // nombre, es a ella a quien llama.
  const definesOwn = (file: string, name: string) => (byName.get(name) ?? []).some((d) => d.file === file);
  const up = (f: FnInfo) => (callersOf.get(f.name) ?? []).filter((c) => c.file === f.file || !definesOwn(c.file, f.name));
  const down = (f: FnInfo) =>
    f.calls.flatMap((c) => {
      const defs = byName.get(c) ?? [];
      const same = defs.filter((d) => d.file === f.file);
      return same.length ? same : defs;
    });
  return { callers: walk(target, up, limits.up), callees: walk(target, down, limits.down) };
}


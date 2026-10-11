/** Mapa de dependencias entre los archivos del proyecto (sin IA): imports internos, ciclos y Mermaid. */
export interface DepFile {
  path: string;
  text: string;
}

export interface DepGraph {
  /** archivo → archivos del proyecto que importa. */
  edges: Map<string, string[]>;
  /** Paquetes externos que usa el proyecto (sin duplicados). */
  external: string[];
}

const JS_EXT = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const exts = (p: string) => (p.includes(".") ? p.slice(p.lastIndexOf(".") + 1).toLowerCase() : "");
export const isSourceFile = (p: string): boolean => JS_EXT.includes(exts(p)) || exts(p) === "py";

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** Une y normaliza rutas relativas («..», «.»). undefined si se sale de la raíz. */
export function joinPath(base: string, rel: string): string | undefined {
  const out: string[] = base ? base.split("/") : [];
  for (const part of rel.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!out.length) return undefined;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

/** Textos de import/require/from de un archivo (sin resolver). */
export function importSpecs(text: string, ext: string): string[] {
  const specs: string[] = [];
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  if (ext === "py") {
    for (const m of code.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import\b/gm)) specs.push(m[1]);
    for (const m of code.matchAll(/^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm)) specs.push(...m[1].split(",").map((s) => s.trim()));
  } else {
    for (const m of code.matchAll(/^[ \t]*(?:import|export)\b[^'"`;]*?\bfrom[ \t]*["']([^"']+)["']/gm)) specs.push(m[1]);
    for (const m of code.matchAll(/^[ \t]*import[ \t]*["']([^"']+)["']/gm)) specs.push(m[1]);
    for (const m of code.matchAll(/\b(?:require|import)[ \t]*\([ \t]*["']([^"']+)["'][ \t]*\)/g)) specs.push(m[1]);
  }
  return specs.filter(Boolean);
}

/** Archivo del proyecto al que apunta un import, o undefined si es un paquete externo / no se encuentra. */
export function resolveImport(spec: string, from: string, known: ReadonlySet<string>, ext: string): string | undefined {
  if (ext === "py") {
    const dots = spec.match(/^\.*/)![0].length;
    const mod = spec.slice(dots).replace(/\./g, "/");
    let base: string | undefined;
    if (dots) {
      base = dirname(from);
      for (let i = 1; i < dots && base !== undefined; i++) base = dirname(base);
      base = joinPath(base, mod);
    } else base = mod;
    if (base === undefined) return undefined;
    for (const c of [`${base}.py`, `${base}/__init__.py`]) if (known.has(c)) return c;
    // «import pkg.mod» desde un subdirectorio de código (src/…): se prueba con el prefijo del archivo.
    const top = from.includes("/") ? from.split("/")[0] : "";
    if (!dots && top) for (const c of [`${top}/${base}.py`, `${top}/${base}/__init__.py`]) if (known.has(c)) return c;
    return undefined;
  }
  if (!spec.startsWith(".")) return undefined;
  const target = joinPath(dirname(from), spec);
  if (target === undefined) return undefined;
  const stem = target.replace(/\.(?:m?js|cjs|jsx?)$/, "");
  const tries = [target, ...JS_EXT.map((e) => `${target}.${e}`), ...JS_EXT.map((e) => `${stem}.${e}`), ...JS_EXT.map((e) => `${target}/index.${e}`)];
  return tries.find((c) => known.has(c));
}

const packageName = (spec: string): string => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0].split(".")[0]);

export function buildDepGraph(files: DepFile[]): DepGraph {
  const source = files.filter((f) => isSourceFile(f.path));
  const known = new Set(source.map((f) => f.path));
  const edges = new Map<string, string[]>();
  const external = new Set<string>();
  for (const f of source) {
    const ext = exts(f.path);
    const targets = new Set<string>();
    for (const spec of importSpecs(f.text, ext)) {
      const to = resolveImport(spec, f.path, known, ext);
      if (to && to !== f.path) targets.add(to);
      else if (!to && !spec.startsWith(".") && !/^(?:node:|\/)/.test(spec)) external.add(packageName(spec));
    }
    edges.set(f.path, [...targets].sort());
  }
  return { edges, external: [...external].sort() };
}

/** Ciclos de dependencia (componentes fuertemente conexos con más de un archivo), el más corto primero. Tarjan iterativo. */
export function findCycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let counter = 0;
  for (const root of edges.keys()) {
    if (index.has(root)) continue;
    const work: { v: string; i: number }[] = [{ v: root, i: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const top = work[work.length - 1];
      const next = edges.get(top.v) ?? [];
      if (top.i < next.length) {
        const w = next[top.i++];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter++);
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v)!, index.get(w)!));
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(top.v)!));
        }
        if (low.get(top.v) === index.get(top.v)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== top.v);
          if (comp.length > 1) out.push(comp.sort());
        }
      }
    }
  }
  return out.sort((a, b) => a.length - b.length || a[0].localeCompare(b[0]));
}

const MAX_EDGES = 80;

/** Diagrama Mermaid: primero las aristas de los ciclos (en rojo), luego las demás hasta el límite. */
export function mermaid(edges: ReadonlyMap<string, readonly string[]>, cycles: string[][]): { code: string; shown: number; total: number } {
  const inCycle = new Map<string, number>();
  cycles.forEach((c, i) => c.forEach((f) => inCycle.set(f, i)));
  const all: [string, string][] = [];
  for (const [from, tos] of edges) for (const to of tos) all.push([from, to]);
  const cyc = all.filter(([a, b]) => inCycle.has(a) && inCycle.get(a) === inCycle.get(b));
  const rest = all.filter((e) => !cyc.includes(e));
  const shown = [...cyc, ...rest].slice(0, MAX_EDGES);
  const id = new Map<string, string>();
  const node = (p: string) => {
    if (!id.has(p)) id.set(p, `n${id.size}`);
    return `${id.get(p)}["${p.replace(/"/g, "'")}"]`;
  };
  const lines = ["graph LR", ...shown.map(([a, b]) => `  ${node(a)} --> ${node(b)}`)];
  const red = shown.map((e, i) => (cyc.includes(e) ? i : -1)).filter((i) => i >= 0);
  if (red.length) lines.push(`  linkStyle ${red.join(",")} stroke:#d33,stroke-width:2px`);
  return { code: lines.join("\n"), shown: shown.length, total: all.length };
}

export function depsMarkdown(g: DepGraph): string {
  const cycles = findCycles(g.edges);
  const total = [...g.edges.values()].reduce((n, l) => n + l.length, 0);
  const out: string[] = [`${g.edges.size} archivos de código · ${total} dependencias internas · ${g.external.length} paquetes externos.`, "", "## Dependencias circulares", ""];
  if (cycles.length) {
    for (const c of cycles.slice(0, 15)) out.push(`- 🔴 ${[...c, c[0]].map((f) => `\`${f}\``).join(" → ")}`);
    if (cycles.length > 15) out.push(`- … y ${cycles.length - 15} más`);
    out.push("", "_Cada ciclo es un grupo de archivos que se importan entre sí (el orden mostrado es alfabético). Rompe el ciclo moviendo lo compartido a un tercer archivo._");
  } else out.push("Ninguna. ¡Bien!");
  const m = mermaid(g.edges, cycles);
  out.push("", "## Mapa", "");
  if (m.shown) {
    out.push("```mermaid", m.code, "```");
    if (m.shown < m.total) out.push("", `_Se muestran ${m.shown} de ${m.total} dependencias (primero las de los ciclos)._`);
  } else out.push("No encontré dependencias entre archivos.");
  const fanIn = new Map<string, number>();
  for (const tos of g.edges.values()) for (const t of tos) fanIn.set(t, (fanIn.get(t) ?? 0) + 1);
  const top = [...fanIn].sort((a, b) => b[1] - a[1]).slice(0, 8);
  out.push("", "## Los más importados", "", ...(top.length ? top.map(([f, n]) => `- \`${f}\` — lo importan ${n} archivo(s)`) : ["Ninguno."]));
  if (g.external.length) out.push("", "## Paquetes externos", "", g.external.slice(0, 40).join(", ") + (g.external.length > 40 ? ", …" : ""));
  return out.join("\n");
}

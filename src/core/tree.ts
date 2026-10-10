/** Nodo de una jerarquía de llamadas (la construye `src/tools/functionTree.ts`). */
export interface CallNode {
  name: string;
  /** Ruta relativa al proyecto. */
  file?: string;
  /** Línea (1-based). */
  line?: number;
  /** Para los «llamadores»: quién los llama a ellos; para los «llamados»: a quién llaman. */
  children: CallNode[];
  /** «cycle»: ya aparece más arriba (recursión). «more»: hay más niveles que no se siguieron. */
  flag?: "cycle" | "more";
}

/** Nodo del recorrido ya ordenado de la entrada hacia la función. */
export interface FlowNode {
  name: string;
  file?: string;
  line?: number;
  note?: string;
  children: FlowNode[];
}

const key = (n: { name: string; file?: string; line?: number }) => `${n.name}|${n.file ?? ""}|${n.line ?? ""}`;
const noteOf = (flag: CallNode["flag"]) => (flag === "cycle" ? "↺ recursión" : flag === "more" ? "… hay más niveles" : undefined);

/** Todos los caminos desde un punto de entrada hasta la función (el último elemento de cada uno). */
export function pathsToTarget(target: CallNode, callers: CallNode[]): FlowNode[][] {
  const me: FlowNode = { name: target.name, file: target.file, line: target.line, children: [] };
  if (!callers.length) return [[me]];
  const out: FlowNode[][] = [];
  const up = (c: CallNode, below: FlowNode[]) => {
    const node: FlowNode = { name: c.name, file: c.file, line: c.line, note: noteOf(c.flag), children: [] };
    const path = [node, ...below];
    if (!c.children.length) out.push(path);
    else for (const parent of c.children) up(parent, path);
  };
  for (const c of callers) up(c, [me]);
  return out;
}

/** Junta los caminos que comparten el mismo comienzo en un árbol (de las entradas hacia la función). */
export function mergePaths(paths: FlowNode[][]): FlowNode[] {
  const roots: FlowNode[] = [];
  for (const path of paths) {
    let level = roots;
    for (const step of path) {
      let found = level.find((n) => key(n) === key(step));
      if (!found) level.push((found = { ...step, children: [] }));
      level = found.children;
    }
  }
  return roots;
}

const place = (n: { file?: string; line?: number }) => (n.file ? `  ‹${n.file}${n.line ? `:${n.line}` : ""}›` : "");

/** Dibuja un árbol con líneas y flechas. `mark` señala el nodo que es la función elegida. */
export function drawTree(roots: FlowNode[], isTarget: (n: FlowNode) => boolean = () => false): string {
  const out: string[] = [];
  const label = (n: FlowNode) => `${isTarget(n) ? "★ " : ""}${n.name}${place(n)}${isTarget(n) ? "   ◀── AQUÍ" : ""}${n.note ? `   ${n.note}` : ""}`;
  const walk = (n: FlowNode, prefix: string, last: boolean, root: boolean) => {
    out.push(root ? label(n) : `${prefix}${last ? "└─▶ " : "├─▶ "}${label(n)}`);
    const next = root ? "" : prefix + (last ? "    " : "│   ");
    n.children.forEach((c, i) => walk(c, next, i === n.children.length - 1, false));
  };
  roots.forEach((r, i) => {
    if (i) out.push("");
    walk(r, "", true, true);
  });
  return out.join("\n");
}

const toFlow = (c: CallNode): FlowNode => ({ name: c.name, file: c.file, line: c.line, note: noteOf(c.flag), children: c.children.map(toFlow) });

const mermaidLabel = (n: { name: string; file?: string; line?: number }) =>
  `${n.name.replace(/["<>\[\]{}|]/g, "'")}${n.file ? `<br/>${n.file.replace(/["<>]/g, "'")}${n.line ? `:${n.line}` : ""}` : ""}`;

export interface TreeDoc {
  target: CallNode;
  callers: CallNode[];
  callees: CallNode[];
  /** Archivo y línea de la función elegida. */
  where: string;
  generated: Date;
}

/** El documento .md completo: resumen, recorrido con flechas, diagrama Mermaid, caminos y archivos implicados. */
export function renderTreeMarkdown(d: TreeDoc): string {
  const paths = pathsToTarget(d.target, d.callers);
  const flow = mergePaths(paths);
  const isTarget = (n: FlowNode) => n.name === d.target.name && n.file === d.target.file && n.line === d.target.line;
  const below = d.callees.map(toFlow);
  const targetNode: FlowNode = { name: d.target.name, file: d.target.file, line: d.target.line, children: below };

  // Diagrama Mermaid: la ruta hacia la función (línea continua) y lo que ella llama (discontinua).
  let n = 0;
  const lines: string[] = ["flowchart TD"];
  const ids = new Map<FlowNode, string>();
  const idOf = (x: FlowNode) => {
    let id = ids.get(x);
    if (!id) ids.set(x, (id = `n${n++}`)), lines.push(`  ${id}["${mermaidLabel(x)}"]`);
    return id;
  };
  const draw = (node: FlowNode, dashed: boolean) => {
    const id = idOf(node);
    for (const c of node.children) {
      lines.push(`  ${id} ${dashed ? "-.->" : "-->"} ${idOf(c)}`);
      draw(c, dashed);
    }
  };
  flow.forEach((r) => draw(r, false));
  // La función elegida es la hoja de cada camino: de ahí cuelga lo que ella llama.
  const leaves: FlowNode[] = [];
  const collect = (x: FlowNode) => (x.children.length ? x.children.forEach(collect) : leaves.push(x));
  flow.forEach(collect);
  for (const leaf of leaves) for (const c of below) (lines.push(`  ${idOf(leaf)} -.-> ${idOf(c)}`), draw(c, true));
  for (const leaf of leaves) lines.push(`  style ${idOf(leaf)} fill:#ffd166,stroke:#b8860b,stroke-width:3px,color:#000`);

  const files = new Set<string>();
  const addFiles = (x: CallNode) => (x.file && files.add(x.file), x.children.forEach(addFiles));
  [d.target, ...d.callers, ...d.callees].forEach(addFiles);
  const count = (xs: CallNode[]): number => xs.reduce((a, c) => a + 1 + count(c.children), 0);
  const entries = paths.map((p) => p[0]).filter((e, i, a) => a.findIndex((o) => key(o) === key(e)) === i);

  const when = d.generated.toLocaleString("es");
  const out: string[] = [
    `# 🌳 Árbol de función · \`${d.target.name}\``,
    "",
    `> 📍 \`${d.where}\` &nbsp;·&nbsp; 🕒 ${when} &nbsp;·&nbsp; generado con **MagicTools**`,
    "",
    "| 🚪 Puntos de entrada | ⬆️ Quién la llama | ⬇️ A quién llama | 📄 Archivos |",
    "|:---:|:---:|:---:|:---:|",
    `| **${d.callers.length ? entries.length : 1}** | **${count(d.callers)}** | **${count(d.callees)}** | **${files.size}** |`,
    "",
    "## 🧭 Cómo se llega hasta aquí",
    "",
    d.callers.length
      ? "Se lee de arriba abajo: cada flecha `▶` es una llamada. La función elegida está marcada con ★."
      : "Nadie la llama dentro de este proyecto: **es un punto de entrada** (o la usa algo externo, como el navegador o un framework).",
    "",
    "```text",
    drawTree(flow, isTarget),
    "```",
    "",
    "## 🔽 Qué hace desde aquí",
    "",
    below.length ? "Lo que la función llama a su vez:" : "No llama a ninguna otra función del proyecto.",
    "",
    ...(below.length ? ["```text", drawTree([targetNode], isTarget), "```", ""] : []),
    "## 🗺️ Diagrama",
    "",
    "Línea continua = camino hasta la función · línea discontinua = lo que ella llama. *(Se dibuja en GitHub o con una extensión de Mermaid; si no, usa los árboles de arriba.)*",
    "",
    "```mermaid",
    ...lines,
    "```",
    "",
    "## 🛤️ Caminos completos",
    "",
    ...paths.map((p, i) => `${i + 1}. ${p.map((x) => `\`${x.name}\``).join(" ➜ ")}`),
    "",
    "## 📄 Archivos implicados",
    "",
    ...[...files].sort().map((f) => `- \`${f}\``),
    "",
    "---",
    "*Puede que falten llamadas dinámicas (callbacks, eventos, `eval`) que el editor no ve.*",
    "",
  ];
  return out.join("\n");
}

/** Nombre de archivo seguro para guardar el árbol de una función. */
export function treeFileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^[._]+|[._]+$/g, "").slice(0, 60);
  return `${safe || "funcion"}.md`;
}

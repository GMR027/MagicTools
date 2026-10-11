import { parseFunctions } from "./callgraph";
import { measure } from "./smells";

/** Cambios de cada archivo según `git log --numstat --format=`. Los renombrados y binarios se ignoran. */
export function parseNumstat(out: string): Map<string, { commits: number; churn: number }> {
  const files = new Map<string, { commits: number; churn: number }>();
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if (!m || m[3].includes("=>")) continue;
    const f = files.get(m[3]) ?? { commits: 0, churn: 0 };
    f.commits++;
    f.churn += Number(m[1]) + Number(m[2]);
    files.set(m[3], f);
  }
  return files;
}

/** Complejidad de un archivo: suma de la complejidad de sus funciones (mínimo 1 si tiene líneas). */
export function fileComplexity(text: string, ext: string): number {
  const rows = text.split(/\r?\n/);
  const fns = parseFunctions(text, ext);
  if (!fns.length) return Math.max(1, Math.round(rows.filter((l) => l.trim()).length / 50));
  return fns.reduce((n, f) => n + measure(rows.slice(f.line, f.end + 1).join("\n")).complexity, 0);
}

export interface Hotspot {
  path: string;
  commits: number;
  churn: number;
  complexity: number;
  score: number;
}

/** Cruza cambios y complejidad: lo que cambia mucho Y es complejo es lo primero que conviene refactorizar. */
export function rankHotspots(changes: ReadonlyMap<string, { commits: number; churn: number }>, complexity: ReadonlyMap<string, number>, top = 15): Hotspot[] {
  const out: Hotspot[] = [];
  for (const [path, c] of changes) {
    const x = complexity.get(path);
    if (x === undefined || c.commits < 2) continue;
    out.push({ path, commits: c.commits, churn: c.churn, complexity: x, score: c.commits * x });
  }
  return out.sort((a, b) => b.score - a.score || b.commits - a.commits).slice(0, top);
}

export function hotspotsMarkdown(list: Hotspot[], months: number): string {
  if (!list.length) return `No encontré archivos que hayan cambiado al menos 2 veces en los últimos ${months} meses.`;
  const rows = list.map((h, i) => `| ${i + 1} | \`${h.path}\` | ${h.commits} | ${h.churn} | ${h.complexity} | ${h.score} |`);
  return [
    `Archivos que **cambian mucho y son complejos** en los últimos ${months} meses (puntuación = cambios × complejidad). Los de arriba son los que más compensa refactorizar primero. Calculado en tu equipo, sin IA.`,
    "",
    "| # | Archivo | Cambios | Líneas tocadas | Complejidad | Puntos |",
    "|--:|---|--:|--:|--:|--:|",
    ...rows,
  ].join("\n");
}

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** 0 = poco equipo … 3 = equipo potente. */
export type Tier = 0 | 1 | 2 | 3;

export interface Hardware {
  ramBytes: number;
  /** 0 si no se detectó ninguna GPU con memoria propia. */
  vramBytes: number;
  gpu: string;
  tier: Tier;
}

/**
 * Clasificación pura (sin detectar nada, para poder probarla):
 * - tier3: GPU con 12 GB o más de VRAM.
 * - tier2: 16 GB o más de RAM, o GPU con 6 GB o más.
 * - tier1: 8 GB o más de RAM.
 * - tier0: menos de 8 GB.
 */
export function tierFor(ramBytes: number, vramBytes = 0): Tier {
  if (vramBytes >= 12 * GB) return 3;
  if (ramBytes >= 16 * GB || vramBytes >= 6 * GB) return 2;
  if (ramBytes >= 8 * GB) return 1;
  return 0;
}

/** Salida de `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` (MiB). Se queda con la GPU de más memoria. */
export function parseNvidiaSmi(out: string): { name: string; vramBytes: number } | undefined {
  let best: { name: string; vramBytes: number } | undefined;
  for (const line of out.split("\n")) {
    const m = line.match(/^(.+?),\s*(\d+)\s*$/);
    if (!m) continue;
    const vramBytes = Number(m[2]) * MB;
    if (!best || vramBytes > best.vramBytes) best = { name: m[1].trim(), vramBytes };
  }
  return best;
}

/** Salida de `rocm-smi --showmeminfo vram` («VRAM Total Memory (B): 17163091968»). */
export function parseRocmSmi(out: string): number {
  return Math.max(0, ...[...out.matchAll(/VRAM Total Memory \(B\):\s*(\d+)/g)].map((m) => Number(m[1])));
}

async function tryRun(cmd: string, args: string[]): Promise<string | undefined> {
  try {
    return (await run(cmd, args, { timeout: 2000, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout;
  } catch {
    return undefined;
  }
}

/** Memoria de vídeo que expone el kernel para las GPU AMD (carpeta /sys/class/drm, archivo mem_info_vram_total), en bytes. */
function drmVram(): number {
  try {
    return Math.max(0, ...fs.readdirSync("/sys/class/drm").filter((d) => /^card\d+$/.test(d)).map((d) => {
      try {
        return Number(fs.readFileSync(`/sys/class/drm/${d}/device/mem_info_vram_total`, "utf8").trim()) || 0;
      } catch {
        return 0;
      }
    }));
  } catch {
    return 0;
  }
}

let cached: Promise<Hardware> | undefined;

/** Detecta RAM y GPU/VRAM (todo con tiempo límite; si nada responde, la GPU es «desconocida»). Se calcula una sola vez. */
export function detectHardware(): Promise<Hardware> {
  cached ??= (async () => {
    const ramBytes = os.totalmem();
    let gpu = "desconocida";
    let vramBytes = 0;
    const nv = parseNvidiaSmi((await tryRun("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])) ?? "");
    if (nv) ({ name: gpu, vramBytes } = nv);
    if (!vramBytes) {
      const rocm = parseRocmSmi((await tryRun("rocm-smi", ["--showmeminfo", "vram"])) ?? "");
      if (rocm) (vramBytes = rocm), (gpu = "AMD (ROCm)");
    }
    if (!vramBytes && process.platform === "linux") {
      const drm = drmVram();
      if (drm) (vramBytes = drm), (gpu = "AMD (amdgpu)");
    }
    return { ramBytes, vramBytes, gpu, tier: tierFor(ramBytes, vramBytes) };
  })();
  return cached;
}

const MODEL_HINT: Record<Tier, string> = {
  0: "modelos de ~1-3B",
  1: "modelos de hasta ~3-4B",
  2: "modelos de hasta ~7B",
  3: "modelos de hasta ~14B",
};

/** Mensaje amable para el panel. */
export function hardwareMessage(h: Pick<Hardware, "ramBytes" | "vramBytes" | "gpu" | "tier">, mode: "local" | "api"): string {
  const ram = `${Math.round(h.ramBytes / GB)} GB de RAM`;
  const gpu = h.vramBytes ? `, GPU con ${Math.round(h.vramBytes / GB)} GB` : "";
  const base = `Tu equipo puede con ${MODEL_HINT[h.tier]} (${ram}${gpu}). Los iconos salen mejor con modelos de código (qwen2.5-coder).`;
  if (h.tier === 0 && mode === "local") return `${base} Con tan poca memoria, el modo API suele dar mejores resultados; puedes cambiarlo arriba cuando quieras.`;
  return base;
}

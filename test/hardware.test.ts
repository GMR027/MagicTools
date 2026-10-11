import assert from "node:assert/strict";
import { test } from "node:test";
import { hardwareMessage, parseNvidiaSmi, parseRocmSmi, tierFor } from "../src/core/hardware";

const GB = 1024 ** 3;

test("tiers por RAM y VRAM simuladas", () => {
  assert.equal(tierFor(4 * GB), 0);
  assert.equal(tierFor(7.9 * GB), 0);
  assert.equal(tierFor(8 * GB), 1);
  assert.equal(tierFor(15.9 * GB), 1);
  assert.equal(tierFor(16 * GB), 2);
  assert.equal(tierFor(32 * GB), 2);
  // Una GPU con VRAM sube el tier aunque la RAM sea poca.
  assert.equal(tierFor(8 * GB, 6 * GB), 2);
  assert.equal(tierFor(4 * GB, 8 * GB), 2);
  assert.equal(tierFor(8 * GB, 5 * GB), 1);
  assert.equal(tierFor(16 * GB, 12 * GB), 3);
  assert.equal(tierFor(8 * GB, 24 * GB), 3);
});

test("nvidia-smi y rocm-smi: se lee la GPU con más memoria", () => {
  const out = "NVIDIA GeForce RTX 3060, 12288\nNVIDIA T400, 4096\n";
  assert.deepEqual(parseNvidiaSmi(out), { name: "NVIDIA GeForce RTX 3060", vramBytes: 12288 * 1024 ** 2 });
  assert.equal(parseNvidiaSmi("command not found"), undefined);
  assert.equal(parseNvidiaSmi(""), undefined);
  assert.equal(parseRocmSmi("GPU[0]\t\t: VRAM Total Memory (B): 17163091968\nGPU[0]\t\t: VRAM Total Used Memory (B): 1000"), 17163091968);
  assert.equal(parseRocmSmi("nada"), 0);
});

test("mensaje de hardware: sugiere el modo API solo con poca memoria y en modo local", () => {
  const hw = (ram: number, vram = 0) => ({ ramBytes: ram * GB, vramBytes: vram * GB, gpu: "x", tier: tierFor(ram * GB, vram * GB) });
  assert.match(hardwareMessage(hw(16), "local"), /hasta ~7B \(16 GB de RAM\)/);
  assert.match(hardwareMessage(hw(16), "local"), /qwen2\.5-coder/);
  assert.match(hardwareMessage(hw(4), "local"), /modo API/);
  assert.doesNotMatch(hardwareMessage(hw(4), "api"), /modo API/);
  assert.match(hardwareMessage(hw(16, 12), "local"), /GPU con 12 GB/);
});

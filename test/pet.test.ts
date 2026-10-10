import assert from "node:assert/strict";
import { test } from "node:test";
import { applyActivity, classifyChange, dayKey, daysBetween, idleDays, moodOf, newPet, RULES, rollover } from "../src/core/pet";

const day = (n: number, h = 10) => new Date(2026, 9, 1 + n, h);
const mine = (n: number) => ({ manual: n });

test("daysBetween y dayKey", () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
});

test("escribir a mano da de comer y se come las letras", () => {
  let p = newPet("gato", day(0));
  p = { ...p, food: 30 };
  p = applyActivity(p, mine(150), day(0));
  assert.equal(p.food, 40);
  assert.equal(moodOf(p, day(0)), "eating");
  assert.equal(moodOf(p, new Date(day(0).getTime() + 10_000)), "exercise");
  assert.equal(moodOf(p, new Date(day(0).getTime() + 5 * 60_000)), "happy");
});

test("el código de la IA infla el globo y escribir a mano lo desinfla", () => {
  let p = newPet("perro", day(0));
  p = applyActivity(p, { ai: 1000 }, day(0));
  assert.equal(p.balloon, 50);
  assert.equal(p.food, 60, "la IA no alimenta");
  assert.equal(moodOf(p, day(0)), "balloon");
  p = applyActivity(p, mine(450), day(0));
  assert.ok(p.balloon < RULES.balloonAt);
  assert.notEqual(moodOf(p, day(0)), "balloon");
});

test("un día sin código da hambre y le quita comida", () => {
  let p = applyActivity(newPet("conejo", day(0)), mine(200), day(0));
  assert.equal(p.streak, 1);
  const food = p.food;
  p = rollover(p, day(1));
  assert.equal(moodOf(p, day(1)), "hungry");
  assert.equal(p.food, food - RULES.foodLossPerDay);
  assert.equal(idleDays(p, dayKey(day(1))), 1);
});

test("la racha cuenta días seguidos y se pierde al saltarse uno", () => {
  let p = newPet("gato", day(0));
  for (const d of [0, 1, 2]) p = applyActivity(p, mine(120), day(d));
  assert.equal(p.streak, 3);
  p = applyActivity(p, mine(120), day(4));
  assert.equal(p.streak, 1);
});

test("sin código tres días se congela y solo una racha lo descongela", () => {
  let p = applyActivity(newPet("pinguino", day(0)), mine(200), day(0));
  p = rollover(p, day(3));
  assert.equal(p.frozen, true);
  assert.equal(moodOf(p, day(3)), "frozen");
  const foodFrozen = applyActivity(p, mine(300), day(3)).food;
  assert.equal(foodFrozen, p.food, "congelado no come");
  p = applyActivity(p, mine(300), day(3));
  p = applyActivity(p, mine(300), day(4));
  assert.equal(p.frozen, true, "dos días no bastan");
  p = applyActivity(p, mine(300), day(5));
  assert.equal(p.streak, 3);
  assert.equal(p.frozen, false);
  assert.notEqual(moodOf(p, day(5)), "frozen");
});

test("un día con poco código no cuenta para la racha", () => {
  const p = applyActivity(newPet("gato", day(0)), mine(RULES.minDayChars - 1), day(0));
  assert.equal(p.streak, 0);
});

test("classifyChange distingue tecleo, pegado, formato y código generado", () => {
  assert.equal(classifyChange({ text: "a", rangeLength: 0 }), "manual");
  assert.equal(classifyChange({ text: "\n    ", rangeLength: 0 }), "ignore");
  assert.equal(classifyChange({ text: "{\n    ", rangeLength: 0 }), "manual");
  const big = "function suma(a, b) {\n  return a + b;\n}\n";
  assert.equal(classifyChange({ text: big, rangeLength: 0 }), "ai");
  assert.equal(classifyChange({ text: big, rangeLength: 0 }, big), "ignore");
  assert.equal(classifyChange({ text: big, rangeLength: big.length - 4 }), "ignore");
});

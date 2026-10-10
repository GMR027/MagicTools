import assert from "node:assert/strict";
import { test } from "node:test";
import { TABS, toolsByTab, toolType, TYPES, validateTools, type ToolDef } from "../src/core/registry";

const tool = (id: string, tab: ToolDef["tab"]): ToolDef => ({ id, tab, title: id, description: "d" });

test("hay tres pestañas: Starter, Junior y Senior", () => {
  assert.deepEqual(TABS.map((t) => t.label), ["Starter", "Junior", "Senior"]);
});

test("toolsByTab agrupa por pestaña y deja vacías las demás", () => {
  const g = toolsByTab([tool("a", "starter"), tool("b", "senior"), tool("c", "starter")]);
  assert.deepEqual(g.starter.map((t) => t.id), ["a", "c"]);
  assert.equal(g.junior.length, 0);
  assert.deepEqual(g.senior.map((t) => t.id), ["b"]);
});

test("validateTools detecta ids repetidos, mal formados y pestañas inexistentes", () => {
  assert.deepEqual(validateTools([tool("a", "starter"), tool("b", "junior")]), []);
  assert.equal(validateTools([tool("a", "starter"), tool("a", "junior")]).length, 1);
  assert.equal(validateTools([tool("A b", "starter")]).length, 1);
  assert.equal(validateTools([tool("x", "master" as ToolDef["tab"])]).length, 1);
});

test("toolType: la IA es «ai», lo demás «util», salvo que se indique otro tipo", () => {
  assert.deepEqual(TYPES.map((t) => t.id), ["ai", "util", "fun"]);
  assert.equal(toolType({ request: () => ({ system: "", user: "", maxTokens: 1, temperature: 0 }) }), "ai");
  assert.equal(toolType({}), "util");
  assert.equal(toolType({ type: "fun" }), "fun");
});

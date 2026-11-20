import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createSemanticEngine } from "./semantic.mjs";

async function fakeEngine(cacheLimit) {
  const seen = [];
  const engine = createSemanticEngine({
    cacheLimit,
    load: async () => async (text) => {
      seen.push(text);
      if (text === "boom") throw new Error("inference failed");
      await delay(5);
      return [0.6, 0.8];
    },
  });
  for (let i = 0; i < 100 && engine.status.state === "loading"; i++)
    await delay(5);
  assert.equal(engine.status.state, "ready");
  const offset = seen.length; // reference descriptions embedded at load
  return { engine, inferred: () => seen.slice(offset) };
}

test("F9: intent cache uses normalized keys, LRU recency and in-flight dedup", async () => {
  const { engine, inferred } = await fakeEngine(2);
  // Arabic letters, Persian digits and extra spaces normalize to one key, and
  // two concurrent requests share a single inference.
  const [a, b] = await Promise.all([
    engine.scores("سرور  ايران ۴ گيگ"),
    engine.scores("سرور ایران 4 گیگ"),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(inferred(), ["سرور ایران 4 گیگ"]);
  await engine.scores("هاست");
  await engine.scores("سرور ایران 4 گیگ"); // hit: becomes most recent
  await engine.scores("vps"); // evicts the least recent key, «هاست»
  assert.equal(inferred().length, 3);
  await engine.scores("سرور ايران ۴ گيگ");
  assert.equal(inferred().length, 3);
  await engine.scores("هاست");
  assert.equal(inferred().length, 4);
  assert.equal(engine.stats().cached, 2);
  // A failed inference is not cached.
  await assert.rejects(engine.scores("boom"));
  await assert.rejects(engine.scores("boom"));
  assert.equal(inferred().filter((x) => x === "boom").length, 2);
});

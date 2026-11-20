import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createSemanticEngine } from "./semantic.mjs";
import { createStore } from "./store.mjs";

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

test("F9: parsed offers are cached and invalidated by replace() and other connections", (t) => {
  const path = mkdtempSync(join(tmpdir(), "abrgozin-cache-"));
  const a = createStore(path),
    b = createStore(path);
  t.after(() => {
    a.db.close();
    b.db.close();
    rmSync(path, { recursive: true, force: true });
  });
  const first = a.offers();
  assert.equal(a.offers(), first, "second read reuses the parsed array");
  const source = first[0].sourceId;
  const kept = first.filter((o) => o.sourceId === source);
  a.replace(source, kept.slice(1));
  const afterOwn = a.offers();
  assert.notEqual(afterOwn, first);
  assert.equal(afterOwn.length, first.length - 1);
  // The legacy container and the refresh CLI write through other connections.
  b.replace(source, kept);
  const afterOther = a.offers();
  assert.notEqual(afterOther, afterOwn);
  assert.equal(afterOther.length, first.length);
  assert.equal(a.offer(kept[0].id).id, kept[0].id);
});

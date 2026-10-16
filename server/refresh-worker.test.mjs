import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { createStore } from "./store.mjs";
import { sources } from "./catalog.mjs";
import {
  createRefreshWorker,
  REFRESH_INTERVAL_MS as interval,
} from "./refresh-worker.mjs";

function clock() {
  let time = Date.parse("2026-10-16T12:00:00Z"),
    id = 0;
  const pending = new Map();
  return {
    now: () => time,
    setTimer(fn, delay) {
      const key = ++id;
      pending.set(key, { fn, at: time + delay });
      return key;
    },
    clearTimer(key) {
      pending.delete(key);
    },
    async advance(ms) {
      const target = time + ms;
      for (;;) {
        const next = [...pending.entries()]
          .filter(([, v]) => v.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at;
        pending.delete(next[0]);
        next[1].fn();
        await setImmediate();
      }
      time = target;
      await setImmediate();
    },
  };
}
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "abrgozin-worker-"));
  const stores = [],
    workers = [],
    timer = clock();
  const open = () => {
    const s = createStore(dir);
    stores.push(s);
    return s;
  };
  const store = open();
  t.after(async () => {
    for (const w of workers) await w.stop();
    for (const s of stores) if (s.db.isOpen) s.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const worker = (options = {}, s = store) => {
    const w = createRefreshWorker(s, {
      ...timer,
      onError: () => {},
      ...options,
    });
    workers.push(w);
    return w;
  };
  return { store, timer, worker, open };
}
const successful = () => sources.map((s) => ({ id: s.id, state: "ok" }));

test("a fresh worker crawls immediately, then waits a full 72 hours after completion", async (t) => {
  const { timer, worker } = setup(t);
  let calls = 0;
  const w = worker({
    refresh: async (_, progress) => {
      calls++;
      progress(sources.length, sources.length);
      return successful();
    },
  });
  w.start();
  await timer.advance(0);
  assert.equal(calls, 1);
  assert.equal(w.status().state, "done");
  assert.equal(w.status().done, sources.length);
  assert.equal(Date.parse(w.status().nextRunAt), timer.now() + interval);
  await timer.advance(interval - 1);
  assert.equal(calls, 1);
  await timer.advance(1);
  assert.equal(calls, 2);
  assert.equal(w.status().trigger, "scheduled");
});

test("schedule survives a database reopen and catches up after downtime", async (t) => {
  const { timer, worker, store, open } = setup(t);
  const first = worker({
    skipInitial: true,
    refresh: async () => successful(),
  });
  first.start();
  const due = first.status().nextRunAt;
  await first.stop();
  store.db.close();
  await timer.advance(interval + 1000);
  let calls = 0;
  const resumed = worker(
    {
      skipInitial: true,
      refresh: async () => {
        calls++;
        return successful();
      },
    },
    open(),
  );
  assert.equal(resumed.status().nextRunAt, due);
  resumed.start();
  await timer.advance(0);
  assert.equal(
    calls,
    1,
    "NO_REFRESH does not reset an existing overdue schedule",
  );
});

test("manual and scheduled workers share a lease across database connections and a persisted cooldown", async (t) => {
  const { timer, worker, open } = setup(t);
  let resolve,
    calls = 0;
  const first = worker({
    refresh: () =>
      new Promise((r) => {
        calls++;
        resolve = r;
      }),
  });
  const second = worker(
    {
      refresh: async () => {
        calls++;
        return successful();
      },
    },
    open(),
  );
  const run = first.run();
  await setImmediate();
  assert.throws(() => second.run(), { status: 409 });
  second.start();
  await timer.advance(150000);
  assert.equal(calls, 1, "heartbeat keeps a long-running crawl exclusive");
  resolve(successful());
  await run;
  assert.throws(() => second.run(), { status: 429, retryAfter: 60 });
  await timer.advance(60000);
  await second.run();
  assert.equal(calls, 2);
});

test("expired leases are recovered, while partial and total failures report accurately", async (t) => {
  const { timer, worker, store } = setup(t);
  const w = worker({
    refresh: async () => [{ id: sources[0].id, state: "ok" }],
  });
  const interrupted = {
    ...w.status(),
    state: "running",
    nextRunAt: new Date(timer.now() + interval).toISOString(),
  };
  store.db
    .prepare(
      "UPDATE refresh_worker SET record=?,owner='crashed-process',leaseUntil=?",
    )
    .run(JSON.stringify(interrupted), timer.now() + 1000);
  w.start();
  await timer.advance(999);
  assert.equal(w.status().state, "running");
  await timer.advance(1);
  assert.equal(w.status().state, "done");
  assert.equal(w.status().succeeded, 1);
  assert.equal(w.status().failed, sources.length - 1);
  await w.stop();
  await timer.advance(60000);
  const failed = worker({ refresh: async () => [] });
  await failed.run();
  assert.equal(failed.status().state, "failed");
  assert.equal(failed.status().failed, sources.length);
  assert.equal(Date.parse(failed.status().nextRunAt), timer.now() + interval);
});

test("fatal failures release the lock, persist an honest error and preserve existing offers", async (t) => {
  const { timer, worker, store } = setup(t);
  const previous = store.offers();
  const w = worker({
    refresh: async () => {
      throw Error("upstream failure");
    },
  });
  await assert.rejects(w.run(), /upstream failure/);
  assert.equal(w.status().state, "failed");
  assert.ok(w.status().error);
  assert.deepEqual(store.offers(), previous);
  const row = store.db
    .prepare("SELECT owner,leaseUntil FROM refresh_worker")
    .get();
  assert.equal(row.owner, null);
  assert.equal(row.leaseUntil, 0);
  assert.equal(Date.parse(w.status().nextRunAt), timer.now() + interval);
});

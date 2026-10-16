import { randomUUID } from "node:crypto";
import { sources } from "./catalog.mjs";
import { refreshSources } from "./ingest.mjs";

export const REFRESH_INTERVAL_MS = 72 * 60 * 60 * 1000;
const leaseMs = 120_000;
const cooldownMs = 60_000;

export function createRefreshWorker(
  store,
  {
    refresh = refreshSources,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    skipInitial = false,
    onError = () => console.error("Price refresh did not complete"),
  } = {},
) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS refresh_worker (
    id INTEGER PRIMARY KEY CHECK(id=1),
    record TEXT NOT NULL,
    owner TEXT,
    leaseUntil INTEGER NOT NULL DEFAULT 0
  )`);
  const read = db.prepare("SELECT * FROM refresh_worker WHERE id=1");
  const latestCheck = Math.max(
    0,
    ...store.status().map((s) => Date.parse(s.checkedAt) || 0),
  );
  const firstDue = latestCheck ? latestCheck + REFRESH_INTERVAL_MS : now();
  db.prepare("INSERT OR IGNORE INTO refresh_worker(id,record) VALUES(1,?)").run(
    JSON.stringify({
      state: "idle",
      done: 0,
      total: sources.length,
      startedAt: null,
      finishedAt: null,
      nextRunAt: new Date(
        skipInitial && firstDue <= now()
          ? now() + REFRESH_INTERVAL_MS
          : firstDue,
      ).toISOString(),
      succeeded: 0,
      failed: 0,
      trigger: null,
      error: null,
    }),
  );
  const owner = randomUUID();
  const write = db.prepare(
    "UPDATE refresh_worker SET record=?,leaseUntil=? WHERE id=1 AND owner=?",
  );
  let enabled = false,
    timer = null,
    heartbeat = null,
    inFlight = null;

  const status = () => ({
    ...JSON.parse(read.get().record),
    intervalHours: 72,
    enabled,
  });
  const fail = (code, message, retryAfter) => {
    throw Object.assign(new Error(message), { status: code, retryAfter });
  };
  function schedule() {
    if (timer) clearTimer(timer);
    if (!enabled || inFlight) return;
    const row = read.get(),
      job = JSON.parse(row.record),
      due =
        job.state === "running" ? row.leaseUntil : Date.parse(job.nextRunAt);
    timer = setTimer(
      () => {
        timer = null;
        try {
          void run("scheduled").catch(onError);
        } catch (error) {
          if (error.status !== 409) onError(error);
          schedule();
        }
      },
      Math.max(0, Math.min(60_000, due - now())),
    );
    timer.unref?.();
  }
  function keepLease() {
    heartbeat = setTimer(() => {
      db.prepare(
        "UPDATE refresh_worker SET leaseUntil=? WHERE id=1 AND owner=?",
      ).run(now() + leaseMs, owner);
      keepLease();
    }, leaseMs / 4);
    heartbeat.unref?.();
  }
  function run(trigger = "manual") {
    let job;
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = read.get(),
        previous = JSON.parse(row.record),
        time = now();
      if (row.owner && row.leaseUntil > time)
        fail(409, "دریافت منابع در حال انجام است");
      if (
        trigger === "scheduled" &&
        previous.state !== "running" &&
        Date.parse(previous.nextRunAt) > time
      ) {
        db.exec("COMMIT");
        schedule();
        return Promise.resolve(null);
      }
      const elapsed = time - Date.parse(previous.finishedAt);
      if (trigger === "manual" && elapsed < cooldownMs)
        fail(
          429,
          "برای بررسی دوباره، یک دقیقه صبر کن",
          Math.ceil((cooldownMs - elapsed) / 1000),
        );
      job = {
        ...previous,
        state: "running",
        done: 0,
        total: sources.length,
        startedAt: new Date(time).toISOString(),
        finishedAt: null,
        nextRunAt: new Date(time + REFRESH_INTERVAL_MS).toISOString(),
        succeeded: 0,
        failed: 0,
        trigger,
        error: null,
      };
      db.prepare(
        "UPDATE refresh_worker SET record=?,owner=?,leaseUntil=? WHERE id=1",
      ).run(JSON.stringify(job), owner, time + leaseMs);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (timer) clearTimer(timer);
    keepLease();
    inFlight = Promise.resolve()
      .then(() =>
        refresh(store, (done, total) => {
          job.done = done;
          job.total = total;
          write.run(JSON.stringify(job), now() + leaseMs, owner);
        }),
      )
      .then((results) => {
        const current = new Map(results.map((s) => [s.id, s]));
        job.succeeded = sources.filter(
          (s) => current.get(s.id)?.state === "ok",
        ).length;
        job.failed = sources.length - job.succeeded;
        job.state = job.succeeded ? "done" : "failed";
        return results;
      })
      .catch((error) => {
        job.state = "failed";
        job.failed = sources.length - job.succeeded;
        job.error = "دریافت قیمت‌ها کامل نشد؛ آخرین دادهٔ معتبر حفظ شده است.";
        throw error;
      })
      .finally(() => {
        if (heartbeat) clearTimer(heartbeat);
        heartbeat = null;
        job.finishedAt = new Date(now()).toISOString();
        job.nextRunAt = new Date(now() + REFRESH_INTERVAL_MS).toISOString();
        db.prepare(
          "UPDATE refresh_worker SET record=?,owner=NULL,leaseUntil=0 WHERE id=1 AND owner=?",
        ).run(JSON.stringify(job), owner);
        inFlight = null;
        schedule();
      });
    return inFlight;
  }
  return {
    status,
    run,
    start() {
      enabled = true;
      schedule();
    },
    async stop() {
      enabled = false;
      if (timer) clearTimer(timer);
      timer = null;
      await inFlight?.catch(() => {});
    },
  };
}

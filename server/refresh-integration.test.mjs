import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";
import { createStore } from "./store.mjs";
import { createRefreshWorker } from "./refresh-worker.mjs";
import { fetchHTML, refreshSources, parseLiara } from "./ingest.mjs";
import { sources } from "./catalog.mjs";

test("real worker HTTP ingestion updates prices and history while preserving failed or changed sources", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "abrgozin-pricing-http-"));
  const logFile = join(dir, "simulation.ndjson");
  const log = openSync(logFile, "w");
  const store = createStore(join(dir, "db"));
  const fixture = (name) =>
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  const $ = load(fixture("liara.html"));
  const card = $("#iaas").nextAll().find(".plan-name").first().parent();
  card
    .find(".spec")
    .filter((_, el) => $(el).find(".label").text().includes("قیمت ماهانه"))
    .find(".value")
    .text("1,200,000");
  writeFileSync(join(dir, "liara.html"), $.html());
  for (const id of ["saba-host", "webramz-vps"])
    copyFileSync(
      new URL(`./fixtures/${id}.html`, import.meta.url),
      join(dir, `${id}.html`),
    );
  const simulation = spawn(
    "postman",
    [
      "simulation",
      "run",
      "postman/simulations/pricing.sim.yaml",
      "--port",
      "4910",
      "--output",
      "ndjson",
    ],
    {
      cwd: new URL("..", import.meta.url),
      detached: true,
      env: { ...process.env, ABRGOZIN_PRICING_FIXTURES: dir },
      stdio: ["ignore", log, log],
    },
  );
  closeSync(log);
  let worker;
  t.after(async () => {
    await worker?.stop();
    try {
      process.kill(-simulation.pid, "SIGINT");
    } catch {}
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (/"(?:type|event)":"listening"/.test(readFileSync(logFile, "utf8"))) {
      ready = true;
      break;
    }
    if (simulation.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, readFileSync(logFile, "utf8").slice(0, 1200));
  const old = store
    .offers()
    .filter((o) => !["liara", "saba-host", "webramz-vps"].includes(o.sourceId));
  const oldStatus = store.status().find((s) => s.id === "iranserver-vps");
  const changed = parseLiara($.html(), new Date().toISOString()).find(
    (o) => o.price === 1200000,
  );
  assert.ok(changed, "modified test tariff is recognizable by the real parser");
  const before = store.offer(changed.id).price;
  assert.notEqual(before, 1200000);
  worker = createRefreshWorker(store, {
    refresh: (s, progress) =>
      refreshSources(s, progress, (url) =>
        fetchHTML(url, { simulationBase: "http://127.0.0.1:4910/pricing" }),
      ),
  });
  await worker.run();
  assert.equal(store.offer(changed.id).price, 1200000);
  assert.equal(store.history(changed.id)[0].oldPrice, before);
  assert.equal(store.history(changed.id)[0].newPrice, 1200000);
  assert.deepEqual(
    store
      .offers()
      .filter(
        (o) => !["liara", "saba-host", "webramz-vps"].includes(o.sourceId),
      ),
    old,
  );
  const status = store.status().find((s) => s.id === "iranserver-vps");
  assert.equal(status.state, "error");
  assert.equal(status.verifiedAt, oldStatus.verifiedAt);
  assert.ok(status.checkedAt);
  assert.equal(worker.status().succeeded, 3);
  assert.equal(worker.status().failed, sources.length - 3);
  assert.equal(worker.status().done, sources.length);
  for (const id of ["saba-host", "webramz-vps"]) {
    assert.equal(store.status().find((s) => s.id === id).state, "ok");
    assert.ok(
      store
        .offers()
        .filter((o) => o.sourceId === id)
        .every((o) => o.mode === "crawl" && o.sourceHash && o.sourceFetchedAt),
    );
  }
  const events = readFileSync(logFile, "utf8");
  assert.match(events, /request/);
  assert.match(events, /saba\.host/);
  assert.match(events, /webramz\.com/);
  await assert.rejects(
    fetchHTML("https://example.com/", {
      simulationBase: "http://127.0.0.1:4910/pricing",
    }),
    /مجاز/,
  );
});

import baseline from "./baseline.json" with { type: "json" };
import { providers } from "./catalog.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
test("API validates requests, isolates sessions, persists choices, and uses official redirects", async (t) => {
  const path = mkdtempSync(join(tmpdir(), "abrgozin-api-")),
    origin = "http://127.0.0.1:4391";
  const child = spawn(process.execPath, ["server/index.mjs", "--dev"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "4391", NO_REFRESH: "1", DATA_DIR: path },
    stdio: "ignore",
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("exit", r));
    rmSync(path, { recursive: true, force: true });
  });
  let health;
  for (let i = 0; i < 80; i++) {
    try {
      health = await fetch(origin + "/api/health");
      if (health.ok) break;
    } catch {}
    await delay(100);
  }
  assert.ok(health?.ok, "test server starts");
  const job = (await health.json()).job;
  assert.equal(job.intervalHours, 72);
  assert.equal(job.enabled, true);
  assert.equal(job.state, "idle");
  assert.ok(Date.parse(job.nextRunAt) > Date.now());
  const first = await fetch(origin + "/api/choices");
  const cookie = first.headers.get("set-cookie").split(";")[0];
  assert.match(first.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const get = (url) => fetch(origin + url, { headers: { cookie } });
  const result = await (
    await get("/api/search?type=vps&traffic=200&ip=true")
  ).json();
  assert.equal(
    result.totalOffers,
    baseline.filter((o) => o.type === "vps").length,
  );
  const catalog = await (await get("/api/catalog")).json();
  assert.equal(catalog.providers.length, 22);
  assert.equal(catalog.workloadGuide.length, 6);
  for (const query of [
    "workload=wordpress&scenario=node",
    "dataGB=-1",
    "backupCopies=1.5",
  ])
    assert.equal((await get("/api/search?" + query)).status, 400);
  const sized = await (
    await get(
      "/api/search?workload=wordpress&scenario=store&resourceMode=minimum",
    )
  ).json();
  assert.equal(sized.requirements.minimum.disk, 10);
  assert.ok(
    [...sized.groups, ...sized.similarGroups].every(
      (g) => g.disk >= 10 && g.ram >= 2,
    ),
  );
  assert.equal(new Set(catalog.offers.map((o) => o.providerId)).size, 22);
  for (const p of providers) {
    const filtered = await (await get("/api/search?provider=" + p.id)).json();
    assert.ok(filtered.totalOffers > 0, p.id + " has usable offers");
    assert.ok(
      filtered.groups
        .flatMap((g) => g.offers)
        .every((o) => o.providerId === p.id),
    );
  }
  for (const query of [
    "provider=liara,arvan",
    "provider=liara&provider=arvan",
  ]) {
    const multi = await (await get("/api/search?" + query)).json();
    assert.deepEqual(
      new Set(multi.groups.flatMap((g) => g.offers.map((o) => o.providerId))),
      new Set(["liara", "arvan"]),
    );
  }
  assert.equal((await get("/api/search?provider=liara,made-up")).status, 400);
  const dedicated = await (await get("/api/search?type=dedicated")).json();
  assert.equal(dedicated.totalOffers, 0);
  assert.deepEqual(dedicated.groups, []);
  const descending = await (await get("/api/search?sort=price-desc")).json();
  assert.deepEqual(
    descending.groups.map((g) => g.min),
    [...descending.groups.map((g) => g.min)].sort((a, b) => b - a),
  );
  const chatStatus = await (await get("/api/chat/status")).json();
  assert.equal(chatStatus.configured, false);
  assert.ok(!JSON.stringify(chatStatus).includes("GEMINI_API_KEY"));
  const missingChat = await fetch(origin + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      messages: [{ role: "user", content: "هاست می‌خوام" }],
    }),
  });
  assert.equal(missingChat.status, 503);
  assert.equal((await missingChat.json()).code, "AI_NOT_CONFIGURED");
  const ids = result.groups.slice(0, 4).map((g) => g.id);
  const put = (value) =>
    fetch(origin + "/api/choices", {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(value),
    });
  assert.equal(
    (await put({ saved: [ids[0]], compared: ids.slice(0, 3) })).status,
    200,
  );
  assert.equal((await put({ saved: [], compared: ids })).status, 400);
  assert.equal((await put({ saved: ["made-up"], compared: [] })).status, 400);
  assert.deepEqual((await (await get("/api/choices")).json()).saved, [ids[0]]);
  assert.deepEqual(
    (await (await fetch(origin + "/api/choices")).json()).saved,
    [],
  );
  assert.equal((await get("/api/search?traffic=-10")).status, 400);
  assert.equal((await get("/api/search?provider=made-up")).status, 400);
  assert.equal((await get("/api/search?ram=made-up")).status, 400);
  assert.equal((await get("/api/search?workload=made-up")).status, 400);
  const docker = await (
    await get("/api/search?type=all&workload=docker&ram=4&disk=40&cpu=2")
  ).json();
  assert.ok(docker.groups.length > 0);
  assert.ok(docker.similarGroups.length > 0);
  assert.ok(
    [...docker.groups, ...docker.similarGroups].every((g) => g.type === "vps"),
  );
  assert.equal(docker.filters.workload, "docker");
  const exact = await (
    await get(
      "/api/search?type=vps&region=ir&ram=2&cpu=1&disk=20&maxPrice=1500000",
    )
  ).json();
  assert.ok(exact.groups.length > 0);
  assert.ok(
    exact.groups.every((g) => g.ram === 2 && g.cpu === 1 && g.disk === 20),
  );
  assert.ok(exact.similarGroups.length > 0);
  assert.ok(
    exact.similarGroups.every(
      (g) =>
        g.region === "ir" &&
        g.differences.length > 0 &&
        g.offers.every((o) => o.estimate.total <= 1500000),
    ),
  );
  assert.ok(
    exact.similarGroups.every((g) => !exact.groups.some((x) => x.id === g.id)),
  );
  const cleared = await (
    await get(
      "/api/search?q=" + encodeURIComponent("سرور ۴ گیگ رم") + "&ram=all",
    )
  ).json();
  assert.deepEqual(cleared.resourceFilters, {});
  const csrf = await fetch(origin + "/api/choices", {
    method: "PUT",
    headers: {
      cookie,
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: JSON.stringify({ saved: [], compared: [] }),
  });
  assert.equal(csrf.status, 403);
  const saved = await (await get("/api/search?saved=true")).json();
  assert.equal(saved.groups.length, 1);
  assert.equal(saved.groups[0].id, ids[0]);
  const redirect = await fetch(origin + "/go/liara-vps-1-2-20", {
    redirect: "manual",
  });
  assert.equal(redirect.status, 302);
  const destination = new URL(redirect.headers.get("location"));
  assert.equal(destination.origin, "https://console.liara.ir");
  assert.equal(destination.searchParams.get("utm_source"), "abrgozin");
  assert.equal(destination.searchParams.get("utm_medium"), "referral");
  assert.equal(
    destination.searchParams.get("utm_campaign"),
    "hosting-comparison",
  );
  assert.equal(destination.searchParams.get("utm_content"), "checkout");
  assert.equal((await get("/go/missing")).status, 404);
  assert.equal((await get("/api/missing")).status, 404);
});

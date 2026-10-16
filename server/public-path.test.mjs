import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runtimeConfig } from "./runtime.mjs";

test("public runtime validates its origin and base path", () => {
  for (const env of [
    { APP_BASE_PATH: "//other.example" },
    { APP_BASE_PATH: "/../" },
    { PUBLIC_URL: "http://example.com" },
    { PUBLIC_URL: "https://example.com/other", APP_BASE_PATH: "/abrgozin" },
    { PUBLIC_URL: "https://user:secret@example.com/" },
    { HOST: "example.com" },
  ])
    assert.throws(() => runtimeConfig(env));
  const config = runtimeConfig({
    APP_BASE_PATH: "/abrgozin/",
    PUBLIC_URL: "https://abeheshti.ir/abrgozin",
  });
  assert.equal(config.basePath, "/abrgozin");
  assert.equal(config.cookiePath, "/abrgozin/");
  assert.ok(config.origins.has("https://abeheshti.ir"));
});

test("the public subpath serves scoped assets, sessions and APIs and rejects foreign writes", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "abrgozin-public-"));
  const dist = join(dir, "dist"),
    origin = "http://127.0.0.1:4392";
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), '<main id="app">Abrgozin</main>');
  writeFileSync(join(dist, "assets", "test.js"), "console.log('Abrgozin')");
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: "4392",
      HOST: "127.0.0.1",
      APP_BASE_PATH: "/abrgozin",
      PUBLIC_URL: "https://abeheshti.ir/abrgozin",
      DIST_DIR: dist,
      DATA_DIR: join(dir, "data"),
      NO_REFRESH: "1",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    child.kill("SIGTERM");
    if (child.exitCode === null)
      await new Promise((resolve) => child.once("exit", resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(origin + "/abrgozin/api/health")).ok;
      if (ready) break;
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "subpath server starts");
  const redirect = await fetch(origin + "/abrgozin?type=hosting", {
    redirect: "manual",
  });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "/abrgozin/?type=hosting");
  for (const path of ["/", "/api/health", "/assets/test.js"])
    assert.equal((await fetch(origin + path)).status, 404);
  const page = await fetch(origin + "/abrgozin/");
  assert.match(await page.text(), /Abrgozin/);
  assert.equal(page.headers.get("cache-control"), "no-cache");
  assert.match(page.headers.get("set-cookie"), /Path=\/abrgozin\/;/);
  assert.match(page.headers.get("set-cookie"), /; Secure/);
  const asset = await fetch(origin + "/abrgozin/assets/test.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  const catalog = await (await fetch(origin + "/abrgozin/api/catalog")).json();
  const choices = { saved: [], compared: [] };
  const write = async (Origin) =>
    fetch(origin + "/abrgozin/api/choices", {
      method: "PUT",
      headers: { Origin, "Content-Type": "application/json" },
      body: JSON.stringify(choices),
    });
  assert.equal((await write("https://abeheshti.ir")).status, 200);
  for (const host of [
    "https://other.example",
    "https://abeheshti.ir.evil.example",
    "http://abeheshti.ir",
  ])
    assert.equal((await write(host)).status, 403);
  assert.equal(
    (
      await fetch(origin + "/abrgozin/api/refresh", {
        method: "POST",
        headers: { Origin: "https://abeheshti.ir" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/abrgozin/api/chat", {
        method: "POST",
        headers: {
          Origin: "https://abeheshti.ir",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "سلام" }] }),
      })
    ).status,
    503,
    "same-origin chat reaches its credential check",
  );
  assert.equal(
    (
      await fetch(origin + "/abrgozin/go/" + catalog.offers[0].id, {
        redirect: "manual",
      })
    ).status,
    302,
  );
});

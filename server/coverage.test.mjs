import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "cheerio";
import { expandedSources } from "./expanded-catalog.mjs";
import { providers, sources } from "./catalog.mjs";
import { parseExpanded, auxiliaryURLs } from "./expanded-ingest.mjs";
import { refreshSources } from "./ingest.mjs";
import { createStore } from "./store.mjs";
import { estimate, number, parseQuery, searchOffers } from "./pricing.mjs";
import baseline from "./baseline.json" with { type: "json" };
const stamp = "2026-10-09T20:00:00.000Z";
const fixture = (id) =>
  readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");
const aux = Object.fromEntries(
  ["224", "222", "223", "225"].map((pid) => [
    `https://portal.mihanhosting.ir/feeds/productsinfo.php?pid=${pid}&get=price&billingcycle=monthly`,
    readFileSync(
      new URL(`./fixtures/mihanhosting-price${pid}.txt`, import.meta.url),
      "utf8",
    ),
  ]),
);
const all = expandedSources.flatMap((s) =>
  parseExpanded(s, fixture(s.id), stamp, aux),
);
const find = (id) => all.find((o) => o.id === id);
test("20 distinct providers each have usable plans, official provenance and stable extraction", () => {
  assert.equal(providers.length, 20);
  assert.equal(new Set(baseline.map((o) => o.providerId)).size, 20);
  for (const s of expandedSources) {
    const parsed = all.filter((o) => o.sourceId === s.id),
      seed = baseline.filter((o) => o.sourceId === s.id);
    assert.ok(parsed.length > 0, s.id);
    assert.equal(parsed.length, seed.length, s.id);
    for (const o of parsed) {
      const prev = seed.find((x) => x.id === o.id);
      assert.ok(prev);
      for (const k of [
        "price",
        "period",
        "cpu",
        "ram",
        "disk",
        "trafficGB",
        "region",
      ])
        assert.equal(o[k], prev[k], o.id + " " + k);
      assert.ok(o.evidence.text.length);
      assert.equal(o.url, s.url);
      assert.equal(new URL(o.checkoutUrl).protocol, "https:");
      assert.ok(Number.isFinite(estimate(o).total));
    }
  }
  assert.equal(all.length, 153);
  assert.equal(baseline.length, 198);
});
test("Currency, compact MB/TB, annual equivalents and capacity are not misrepresented", () => {
  assert.equal(number("۱٫۲۸"), 1.28);
  assert.equal(number("1،550،000"), 1550000);
  const h = find("hostnegar-P1");
  assert.equal(h.disk, 0.1);
  assert.equal(h.period, 3);
  assert.equal(h.upfront, 560500);
  assert.equal(estimate(h, { traffic: 0 }).upfront, 560500);
  assert.equal(find("iranhost-IR-VPS-2-2-40").trafficGB, 1000);
  assert.equal(find("iranhost-IR-VPS-1-2-20").period, 12);
  assert.equal(find("bertina-IRVDS-1").price, 850000);
  assert.equal(find("afagh-بسته-یک").disk, 0.1);
  assert.equal(find("afagh-بسته-یک").upfront, 1550000);
  assert.equal(find("talahost-0.2").period, 12);
  assert.equal(find("talahost-0.5").period, 6);
  assert.equal(find("talahost-1").period, 3);
  assert.equal(all.filter((o) => o.providerId === "mihanwebhost").length, 5);
  assert.ok(
    all
      .filter((o) => o.providerId === "mihanwebhost")
      .every((o) => o.name !== "پلن ایران 1"),
  );
  assert.equal(find("webdade-std-2-2-40").trafficGB, 0);
  assert.equal(find("webdade-std-2-2-40").trafficRate, 1000);
  assert.equal(find("mihanhosting-224").price, 591000);
  assert.equal(find("mihanhosting-224").region, "unknown");
});
test("Source-specific monthly fields ignore another active billing cycle", () => {
  const s = expandedSources.find((s) => s.providerId === "serverir"),
    $ = load(fixture(s.id));
  $(".show-price").text("99999999 تومان");
  const parsed = parseExpanded(s, $.html(), stamp);
  assert.equal(parsed[0].price, 2430000);
});
test("Sources reject changed/empty schemas and missing auxiliary prices without invented fallback", () => {
  for (const s of expandedSources)
    assert.throws(
      () =>
        parseExpanded(s, "<main>شروع قیمت از ۱۰۰ هزار تومان</main>", stamp, {}),
      s.id,
    );
  const s = expandedSources.find((s) => s.providerId === "mihanhosting");
  assert.equal(auxiliaryURLs(s, fixture(s.id)).length, 4);
  assert.throws(() => parseExpanded(s, fixture(s.id), stamp, {}));
  assert.throws(() =>
    parseExpanded(s, fixture(s.id), stamp, {
      ...aux,
      [Object.keys(aux)[0]]: "document.write('<script>');",
    }),
  );
});
test("New provider queries and hosting resource groups keep the correct service label", () => {
  for (const p of providers)
    assert.equal(parseQuery(p.name).fields.provider, p.id);
  const g = searchOffers(all, { provider: "mizbanfa", type: "hosting", q: "" })
    .groups[0];
  assert.equal(g.serviceType, "hosting");
  assert.ok(g.cpu > 0);
  const host = searchOffers(all, { q: "هاست مهرهاست", type: "all" });
  assert.ok(host.totalOffers > 0);
  assert.ok(
    host.groups
      .flatMap((g) => g.offers)
      .every((o) => o.providerId === "mehrhost"),
  );
});
test("Live ingestion dispatches every new source and retains a source when its price feed fails", async (t) => {
  const path = mkdtempSync(join(tmpdir(), "abrgozin-coverage-")),
    store = createStore(path);
  t.after(() => {
    store.db.close();
    rmSync(path, { recursive: true, force: true });
  });
  const oldFeed = store.offers().filter((o) => o.providerId === "mihanhosting");
  let progress = 0;
  await refreshSources(
    store,
    (n) => (progress = n),
    async (url) => {
      const s = expandedSources.find((s) => s.url === url);
      if (s) return fixture(s.id);
      if (url.includes("productsinfo.php")) throw Error("fetch failed");
      throw Error("source intentionally unavailable");
    },
  );
  assert.equal(progress, sources.length);
  for (const s of expandedSources.filter(
    (s) => s.providerId !== "mihanhosting",
  ))
    assert.equal(store.status().find((x) => x.id === s.id).state, "ok", s.id);
  assert.deepEqual(
    store.offers().filter((o) => o.providerId === "mihanhosting"),
    oldFeed,
  );
  assert.equal(
    store.status().find((x) => x.id === "mihanhosting-host").state,
    "error",
  );
});
test("Coverage upgrade preserves choices and history and does not resurrect an emptied existing source", (t) => {
  const path = mkdtempSync(join(tmpdir(), "abrgozin-upgrade-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  let s = createStore(path);
  const p = s.offers().find((o) => o.providerId === "liara");
  s.replace("liara", [{ ...p, price: p.price + 1 }]);
  s.setChoices("owner", { saved: ["vps-ir-1-2-20"], compared: [] });
  // Simulate a pre-upgrade DB by removing only new sources and statuses.
  for (const src of expandedSources) {
    s.db.prepare("DELETE FROM offers WHERE sourceId=?").run(src.id);
    s.db.prepare("DELETE FROM source_status WHERE id=?").run(src.id);
  }
  s.replace("netafraz-host", []);
  s.db.close();
  s = createStore(path);
  assert.equal(new Set(s.offers().map((o) => o.providerId)).size, 20);
  assert.equal(
    s.offers().filter((o) => o.sourceId === "netafraz-host").length,
    0,
  );
  assert.equal(s.history(p.id).length, 1);
  assert.equal(s.choices("owner").saved[0], "vps-ir-1-2-20");
  s.db.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimate, parseQuery, searchOffers, groupKey } from "./pricing.mjs";
import {
  parseLiara,
  parseIranserver,
  parseNetafraz,
  refreshSources,
} from "./ingest.mjs";
import { arvanOffers, sources } from "./catalog.mjs";
import { createStore } from "./store.mjs";
const stamp = "2026-10-09T17:24:13.000Z";
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const liara = parseLiara(fixture("liara"), stamp);
const iran = parseIranserver(fixture("iranserver"), stamp);
const hosts = parseNetafraz(fixture("netafraz"), stamp, "netafraz-host");
function temporaryStore(t) {
  const path = mkdtempSync(join(tmpdir(), "abrgozin-test-"));
  const s = createStore(path);
  t.after(() => {
    s.db.close();
    rmSync(path, { recursive: true, force: true });
  });
  return s;
}
test("Persian query extracts resources, location and budget with Persian/Arabic digits", () => {
  assert.deepEqual(
    parseQuery("سرور ایران با ۴ گیگ رم، ٢ هسته، ۴۰ گیگ فضا زیر ۳ میلیون")
      .fields,
    { ram: 4, cpu: 2, disk: 40, region: "ir", type: "vps", maxPrice: 3000000 },
  );
  assert.equal(parseQuery("هاست خارج تا ۵۰۰ هزار").fields.maxPrice, 500000);
  assert.equal(parseQuery("سرور آروان").fields.provider, "arvan");
});
test("Liara extraction distinguishes VPS and managed WordPress; adds real IP and traffic tariffs", () => {
  assert.equal(liara.length, 12);
  const o = liara.find((o) => o.type === "vps" && o.ram === 2);
  assert.equal(o.price, 1475000);
  assert.equal(o.ipMonthly, 200000);
  assert.equal(o.trafficRate, 2500);
  assert.equal(estimate(o, { traffic: 200, ip: true }).total, 2175000);
  assert.equal(estimate(o, { traffic: 0, ip: false }).total, 1475000);
  assert.ok(estimate(o).warnings.some((w) => w.includes("مالیات")));
  assert.equal(liara.filter((o) => o.type === "wordpress").length, 6);
});
test("Iranserver table extraction preserves real order destination and NVMe distinction", () => {
  assert.equal(iran.length, 5);
  assert.equal(iran[0].price, 2012399);
  assert.equal(iran[0].trafficGB, 1000);
  assert.equal(iran[0].diskType, "NVMe");
  assert.ok(iran[0].checkoutUrl.startsWith("https://hub.iranserver.com/"));
  assert.ok(
    estimate(iran[0], { traffic: 2000 }).warnings.some((w) =>
      w.includes("ترافیک"),
    ),
  );
});
test("Netafraz handles unavailable monthly rates, quarter minimum, VAT and unlimited traffic", () => {
  assert.equal(hosts.length, 10);
  const e1 = hosts.find((o) => o.name === "E1" && o.region === "ir");
  assert.equal(e1.period, 3);
  assert.equal(estimate(e1, { traffic: 0 }).total, 172333);
  assert.equal(estimate(e1, { traffic: 0 }).upfront, 517000);
  assert.equal(e1.cpu, null);
  const standard = parseNetafraz(
    fixture("netafraz-standard"),
    stamp,
    "netafraz-standard",
  );
  assert.equal(standard.length, 6);
  assert.equal(standard.find((o) => o.disk === 50).trafficUnlimited, true);
  assert.equal(
    standard.find((o) => o.disk === 25 && o.region === "ir").price,
    590000,
  );
});
test("Invalid or changed source structures are rejected instead of fabricating plans", () => {
  for (const parser of [parseLiara, parseIranserver])
    assert.throws(() => parser("<body>پلن‌ها از ۱۰۰ هزار تومان</body>", stamp));
  assert.throws(() =>
    parseNetafraz("<body>هاست ارزان</body>", stamp, "netafraz-host"),
  );
});
test("Arvan calculated configurations include per-account free traffic assumption", () => {
  const o = arvanOffers().find((o) => o.cpu === 1 && o.ram === 2);
  assert.equal(o.price, 837000);
  assert.equal(estimate(o, { traffic: 200, ip: true }).total, 1032000);
  assert.equal(estimate(o, { traffic: 500, ip: true }).total, 1482000);
  assert.equal(o.custom, true);
  assert.ok(o.notes.some((n) => n.includes("حساب")));
});
test("Grouping compares equal resources without mixing shared hosting and raw servers", () => {
  const data = searchOffers([...arvanOffers(), ...liara, ...iran, ...hosts], {
    q: "",
    type: "vps",
    traffic: 200,
    ip: true,
    sort: "price",
  });
  const g = data.groups.find((g) => g.cpu === 1 && g.ram === 2);
  assert.equal(g.providerCount, 2);
  assert.deepEqual(
    g.offers.map((o) => o.providerId),
    ["arvan", "liara"],
  );
  assert.ok(data.groups.every((g) => g.type === "vps"));
  assert.ok(data.groups.every((g, i, a) => !i || g.min >= a[i - 1].min));
  assert.notEqual(groupKey(liara[0]), groupKey(liara[6]));
});
test("Budget applies to actual monthly estimate and Persian intent applies to returned resources", () => {
  const d = searchOffers([...arvanOffers(), ...liara, ...iran], {
    q: "سرور ایران ۴ گیگ رم زیر ۳ میلیون",
    type: "all",
    traffic: 200,
    ip: true,
  });
  assert.ok(d.groups.length);
  assert.ok(d.groups.every((g) => g.ram === 4 && g.region === "ir"));
  assert.ok(
    d.groups.flatMap((g) => g.offers).every((o) => o.estimate.total <= 3000000),
  );
  const none = searchOffers(liara, {
    q: "",
    maxPrice: 100000,
    traffic: 200,
    ip: true,
  });
  assert.equal(none.groups.length, 0);
});
test("Saved filters return only saved resource groups", () => {
  const id = groupKey(liara[0]);
  const d = searchOffers(liara, { q: "", saved: [id], traffic: 0, ip: false });
  assert.equal(d.groups.length, 1);
  assert.equal(d.groups[0].id, id);
});
test("Choices and offers persist through database reopen; sources removed by ingestion stay removed", (t) => {
  const path = mkdtempSync(join(tmpdir(), "abrgozin-persist-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  let s = createStore(path);
  s.setChoices("user-a", { saved: ["vps-ir-1-2-20"], compared: [] });
  s.replace("liara", liara.slice(0, 1));
  s.db.close();
  s = createStore(path);
  assert.equal(s.offers().filter((o) => o.sourceId === "liara").length, 1);
  assert.equal(s.choices("user-a").saved[0], "vps-ir-1-2-20");
  assert.deepEqual(s.choices("user-b").saved, []);
  s.db.close();
});
test("Price history records changed tariffs; failing source replacement rolls back", (t) => {
  const s = temporaryStore(t);
  s.replace("liara", liara);
  s.replace(
    "liara",
    liara.map((o, i) => (i ? o : { ...o, price: o.price + 1000 })),
  );
  assert.equal(s.history(liara[0].id).length, 1);
  const before = s.offers();
  assert.throws(() =>
    s.replace("liara", [{ ...liara[0], id: "arvan-1-1-20" }]),
  );
  assert.deepEqual(s.offers(), before);
});
test("Network failure retains the last verified records and timestamp", async (t) => {
  const s = temporaryStore(t);
  s.replace("liara", liara);
  s.setStatus({
    id: "liara",
    state: "ok",
    verifiedAt: stamp,
    checkedAt: stamp,
    count: 12,
  });
  const old = s.offers();
  let progress = 0;
  await refreshSources(
    s,
    (n) => (progress = n),
    async () => {
      throw new Error("fetch failed");
    },
  );
  assert.equal(progress, sources.length);
  assert.deepEqual(s.offers(), old);
  const state = s.status().find((x) => x.id === "liara");
  assert.equal(state.state, "error");
  assert.equal(state.verifiedAt, stamp);
  assert.notEqual(state.checkedAt, stamp);
});

test("Rounded line items always sum to the estimate; zero budget returns no paid offers", () => {
  const o = hosts.find((o) => o.name === "E1" && o.region === "ir");
  const e = estimate(o);
  assert.equal(
    e.parts.reduce((s, p) => s + p.amount, 0),
    e.total,
  );
  assert.equal(searchOffers(liara, { q: "", maxPrice: 0 }).groups.length, 0);
  assert.equal(parseQuery("سرور لیارا ۴ گیگ رم").fields.provider, "liara");
});

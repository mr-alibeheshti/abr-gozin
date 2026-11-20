import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import baseline from "./baseline.json" with { type: "json" };
import { foreignSources } from "./foreign-catalog.mjs";
import { parseForeign } from "./foreign-ingest.mjs";
import { estimate, parseQuery, searchOffers } from "./pricing.mjs";
import { COUNTRIES, regionOf, locate, catalogCountries } from "./countries.mjs";
import { searchParams } from "./filters.mjs";
import { createStore } from "./store.mjs";
import { refreshSources } from "./ingest.mjs";
import { sources } from "./catalog.mjs";

const fixture = (id) =>
  readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");
const source = (id) => foreignSources.find((s) => s.id === id);
const parse = (id, html = fixture(id)) =>
  parseForeign(source(id), html, "2026-11-20T15:17:27.000Z");
const search = (q, extra = {}) =>
  searchOffers(baseline, { q, traffic: 200, ip: true, ...extra });

test("every foreign page parses its recorded fixture into the seeded offers", () => {
  const hosts = {
    iranserver: "www.iranserver.com",
    bertina: "www.bertina.ir",
    hidata: "hidata.org",
    parsvds: "parsvds.com",
    serverir: "server.ir",
    onlineserver: "onlineserver.ir",
    azaronline: "azaronline.com",
    webramz: "webramz.com",
    iranhost: "iranhost.com",
    webdade: "webdade.com",
    hostnegar: "hostnegar.com",
  };
  let total = 0;
  for (const s of foreignSources) {
    assert.equal(new URL(s.url).hostname, hosts[s.providerId], s.id);
    assert.ok(sources.includes(s), s.id);
    const parsed = parse(s.id),
      seed = baseline.filter((o) => o.sourceId === s.id);
    assert.ok(parsed.length > 0, s.id);
    assert.equal(parsed.length, seed.length, s.id);
    total += parsed.length;
    for (const o of parsed) {
      const prev = seed.find((x) => x.id === o.id);
      assert.ok(prev, o.id);
      for (const k of [
        "price",
        "period",
        "cpu",
        "ram",
        "disk",
        "trafficGB",
        "region",
        "country",
        "billing",
      ])
        assert.deepEqual(o[k], prev[k], `${o.id} ${k}`);
      assert.equal(o.countries.length, 1, o.id);
      assert.ok(COUNTRIES[o.country], o.id);
      assert.equal(o.region, regionOf(o.country), o.id);
      assert.notEqual(o.country, "IR", o.id);
      if (s.country) assert.equal(o.country, s.country, o.id);
      assert.equal(o.url, s.url);
      assert.equal(new URL(o.checkoutUrl).protocol, "https:");
      assert.ok(o.evidence.text.length, o.id);
      assert.ok(Number.isFinite(estimate(o).total), o.id);
      assert.ok(o.verifiedAt, o.id);
    }
  }
  assert.equal(total, 250);
  // Turkey is never labelled Europe.
  assert.ok(
    baseline
      .filter((o) => o.country === "TR")
      .every((o) => o.region === "other"),
  );
});

test("foreign extractors read the published toman prices and billing periods", () => {
  const by = (id, offerId) => parse(id).find((o) => o.id === offerId);
  // IranServer: monthly cards, annual-only VpsX with the monthly equivalent,
  // «استعلام از واحد فروش» cards skipped.
  const cx23 = by("iranserver-vps-de", "iranserver-de-CX23");
  assert.deepEqual(
    [
      cx23.cpu,
      cx23.ram,
      cx23.disk,
      cx23.trafficGB,
      cx23.ipMonthly,
      cx23.price,
      cx23.period,
    ],
    [2, 4, 40, 15000, 0, 3376000, 1],
  );
  const vpsx = by("iranserver-vps-de", "iranserver-de-VpsX-EU-16");
  assert.deepEqual(
    [vpsx.price, vpsx.period, vpsx.billing, vpsx.upfront],
    [17730000, 12, "annual", 212760000],
  );
  assert.equal(by("iranserver-vps-de", "iranserver-de-CPX22"), undefined);
  assert.equal(by("iranserver-vps-fi", "iranserver-fi-CPX22").price, 11267000);
  assert.equal(
    by("iranserver-vps-fr", "iranserver-fr-VPS-1").trafficUnlimited,
    true,
  );
  // Bertina: order card and structured data (rial) agree.
  const devds = by("bertina-vps-de", "bertina-de-DEVDS-1");
  assert.deepEqual(
    [devds.cpu, devds.ram, devds.disk, devds.trafficGB, devds.price],
    [1, 1, 25, 1000, 909000],
  );
  // HiData: monthly (m1) column; traffic unlimited; IP not stated → null.
  const hd = by("hidata-vps-de-nvme", "hidata-DE-NVMe-1GB");
  assert.deepEqual(
    [hd.cpu, hd.ram, hd.disk, hd.price, hd.trafficUnlimited, hd.ipMonthly],
    [1, 1, 20, 1300000, true, null],
  );
  assert.equal(by("hidata-vps-de-sata", "hidata-DE-SATA-1GB").diskType, "SATA");
  // ParsVDS: one offer per order ID; two tables on the France page.
  assert.equal(by("parsvds-vps-de", "parsvds-de-1397").price, 996000);
  assert.equal(parse("parsvds-vps-fr").length, 12);
  assert.equal(by("parsvds-vps-tr", "parsvds-tr-1493").country, "TR");
  // Server.ir: one offer per stated country; «+10 کشور جهان» is not a country.
  const fr = by("serverir-vps-foreign", "serverir-FRHV1011-fr"),
    us = by("serverir-vps-foreign", "serverir-FRHV1011-us");
  assert.deepEqual(
    [fr.price, fr.region, us.region, us.checkoutUrl],
    [1759500, "eu", "other", fr.checkoutUrl],
  );
  assert.ok(!parse("serverir-vps-foreign").some((o) => /nlps/i.test(o.name)));
  // OnlineServer: Turkey cards state no CPU, so it stays unknown (null).
  const tr = by("onlineserver-vps-tr", "onlineserver-srwr-mjazy-trkyh-1gyg");
  assert.deepEqual(
    [tr.cpu, tr.ram, tr.disk, tr.price, tr.region],
    [null, 1, 30, 1527300, "other"],
  );
  const wp = by(
    "onlineserver-host-fr",
    "onlineserver-hst-1gyg-wrdprs-khrj-z-yrn",
  );
  assert.deepEqual(
    [wp.type, wp.disk, wp.price, wp.country],
    ["wordpress", 1, 1057000, "FR"],
  );
  // Server.ir hosting: one offer per stated country (Germany, Netherlands).
  const nl = by("serverir-host-foreign", "serverir-FLHC1-Lite-nl");
  assert.deepEqual(
    [nl.type, nl.disk, nl.price, nl.region, nl.trafficUnlimited],
    ["hosting", 1, 290000, "eu", true],
  );
  assert.equal(
    by("serverir-host-foreign", "serverir-FLHC1-Lite-de").price,
    290000,
  );
  // AzarOnline: annual-only monthly equivalent; traffic per the page's rule.
  const az = by("azaronline-vps-us", "azaronline-us-linux-1");
  assert.deepEqual(
    [
      az.cpu,
      az.ram,
      az.disk,
      az.price,
      az.period,
      az.upfront,
      az.trafficUnlimited,
    ],
    [2, 1, 50, 755000, 12, 9060000, true],
  );
  assert.equal(
    by("azaronline-vps-ae", "azaronline-ae-linux-1").trafficGB,
    1000,
  );
  // Webramz France (OVH) and IranHost Canada (annual-only, rounded).
  const wfr = by("webramz-vps-fr", "webramz-fr-OCVPS-20");
  assert.deepEqual(
    [wfr.cpu, wfr.ram, wfr.disk, wfr.price, wfr.country],
    [1, 2, 20, 2381000, "FR"],
  );
  const ihca = by("iranhost-vps-ca", "iranhost-VPS-CA-2-2-40");
  assert.deepEqual(
    [
      ihca.cpu,
      ihca.ram,
      ihca.disk,
      ihca.trafficGB,
      ihca.price,
      ihca.period,
      ihca.region,
    ],
    [2, 2, 40, 1000, 2000000, 12, "other"],
  );
  // Webdade Netherlands (monthly toman) and HostNegar (monthly rial → toman,
  // one offer per stated country).
  const wd = by("webdade-vps-nl", "webdade-nl-netherlands-starter");
  assert.deepEqual(
    [wd.cpu, wd.ram, wd.disk, wd.trafficGB, wd.price, wd.trafficRate],
    [1, 1, 20, 20000, 2365100, null],
  );
  const hn = parse("hostnegar-vps-foreign").filter(
    (o) => o.name === "سرور مجازی - استارت",
  );
  assert.deepEqual(hn.map((o) => o.country).sort(), ["DE", "FR", "NL"]);
  assert.ok(
    hn.every((o) => o.price === 4233500 && o.ram === 3 && o.ipMonthly === 0),
  );
  // The Iran parser still reads only the Iran cards of the same page.
  const ca = by("azaronline-vps-ca", "azaronline-ca-linux-1");
  assert.deepEqual([ca.trafficGB, ca.trafficUnlimited], [null, false]);
});

test("foreign extractors refuse pages they cannot verify instead of guessing", () => {
  const refuse = (id, from, to) => {
    const html = fixture(id);
    assert.ok(html.includes(from), `${id}: fixture lacks ${from}`);
    assert.throws(() => parse(id, html.replaceAll(from, to)), id);
  };
  // A redirect to another country's page (title check).
  refuse(
    "parsvds-vps-de",
    "سرور مجازی آلمان - خرید VPS آلمان",
    "سرور مجازی هلند",
  );
  // Currency or billing period changes.
  refuse("iranserver-vps-fr", "به ازای هر ماه", "به ازای هر سه ماه");
  const currency = fixture("iranserver-vps-fr").replace(
    /(pricing-card__currency">\s*)تومان/g,
    "$1دلار",
  );
  assert.throws(() => parse("iranserver-vps-fr", currency));
  refuse("onlineserver-vps-us", "ماهانه", "سالانه");
  refuse("parsvds-vps-us", "امکان خرید سرویس بیش از یک ماه وجود دارد", "");
  refuse(
    "hidata-vps-de-nvme",
    "ترافیک ماهانه نامحدود",
    "ترافیک ماهانه 1 ترابایت",
  );
  refuse("azaronline-vps-de", "در صورت خرید سالانه", "در صورت خرید ماهانه");
  refuse("webramz-vps-fr", "موقعیت سرور", "محل سرور");
  refuse("webdade-vps-nl", "ماهانه / تومان", "ماهانه / یورو");
  refuse("hostnegar-vps-foreign", "موقعیت سرور هلند", "سرور");
  // Bertina's card price must equal its structured data.
  refuse("bertina-vps-de", '"price":9090000', '"price":8090000');
  // A «from» price varies by location and is not a tariff.
  refuse(
    "onlineserver-vps-fi-cloud",
    '<b dir="ltr">۴٬۹۹۱٬۵۰۰</b>',
    '<small>از</small> <b dir="ltr">۴٬۹۹۱٬۵۰۰</b>',
  );
});

test("country names in queries set ISO country and region; provider names never do", () => {
  const cases = [
    ["سرور مجازی آلمان", "DE", "eu"],
    ["سرور فنلاند", "FI", "eu"],
    ["vps france", "FR", "eu"],
    ["هاست هلند", "NL", "eu"],
    ["سرور انگلیس", "GB", "eu"],
    ["سرور ترکیه", "TR", "other"],
    ["vps turkey", "TR", "other"],
    ["سرور آمریکا", "US", "other"],
    ["سرور امریکایی ارزان", "US", "other"],
    ["server in usa", "US", "other"],
    ["سرور کانادا", "CA", "other"],
    ["سرور مجازی امارات", "AE", "other"],
    ["germany vps 4gb ram", "DE", "eu"],
  ];
  for (const [q, country, region] of cases) {
    const { fields } = parseQuery(q);
    assert.equal(fields.country, country, q);
    assert.equal(fields.region, region, q);
  }
  // «ایران‌سرور»/«ایران هاست» select the provider, not Iran; a country after
  // the provider name still applies.
  assert.deepEqual(parseQuery("ایرانسرور آلمان").fields, {
    provider: "iranserver",
    region: "eu",
    country: "DE",
  });
  assert.equal(parseQuery("ایران هاست").fields.region, undefined);
  assert.equal(parseQuery("ایران سرور").fields.country, undefined);
  // «خارج از ایران» keeps its region (eu) without inventing a country.
  assert.deepEqual(parseQuery("سرور خارج از ایران").fields, {
    region: "eu",
    type: "vps",
  });
  // «انگلیسی» usually means the language: no country.
  assert.equal(parseQuery("هاست برای سایت انگلیسی").fields.country, undefined);
});

test("country search: results when the catalog has them, an honest empty state otherwise", () => {
  for (const [q, code] of [
    ["سرور ترکیه", "TR"],
    ["سرور آمریکا", "US"],
    ["سرور فنلاند", "FI"],
    ["vps france", "FR"],
    ["سرور کانادا", "CA"],
  ]) {
    const r = search(q);
    assert.ok(r.groups.length > 0, q);
    assert.equal(r.emptyReason, null, q);
    assert.equal(r.filters.country, code, q);
    assert.ok(
      r.groups.every(
        (g) =>
          g.region === regionOf(code) &&
          g.offers.every((o) => o.countries.includes(code)),
      ),
      q,
    );
  }
  // Turkey is not Europe: «سرور ترکیه» never returns eu groups.
  assert.ok(search("سرور ترکیه").groups.every((g) => g.region === "other"));
  // No Turkish hosting in the catalog: honest reason, region alternatives.
  const host = search("هاست ترکیه");
  assert.equal(host.groups.length, 0);
  assert.equal(host.emptyReason, "no-country-in-catalog");
  assert.deepEqual(
    { ...host.emptyContext, europeOffers: host.emptyContext.europeOffers > 0 },
    { country: "TR", region: "other", regionOffers: 0, europeOffers: true },
  );
  const jp = search("سرور ژاپن");
  assert.equal(jp.emptyReason, "no-country-in-catalog");
  assert.equal(jp.emptyContext.region, "other");
  assert.ok(jp.emptyContext.regionOffers > 0);
  // «حذف فیلتر موقعیت» (region=any) and an explicit region ignore the text.
  const any = search("سرور ترکیه", { region: "any" });
  assert.equal(any.filters.country, undefined);
  assert.ok(any.groups.some((g) => g.region === "ir"));
  const other = search("سرور ژاپن", { region: "other" });
  assert.ok(other.groups.length > 0);
  assert.ok(other.groups.every((g) => g.region === "other"));
  // An explicit country wins over the text and over region.
  const fi = search("سرور ترکیه", { country: "FI", region: "ir" });
  assert.equal(fi.filters.region, "eu");
  assert.ok(
    fi.groups.every((g) => g.offers.every((o) => o.countries.includes("FI"))),
  );
  // A European country also lists plans whose page names no country inside
  // Europe (Netafraz «اروپا»), never another named country.
  const nl = search("هاست هلند");
  assert.ok(nl.groups.length > 0);
  assert.ok(
    nl.groups.every((g) =>
      g.offers.every(
        (o) => o.countries.includes("NL") || o.countries.length === 0,
      ),
    ),
  );
  assert.ok(
    nl.groups.some((g) => g.offers.some((o) => o.providerId === "netafraz")),
  );
  // Provider + country.
  const isde = search("ایرانسرور آلمان");
  assert.ok(isde.groups.length > 0);
  assert.ok(
    isde.groups.every((g) =>
      g.offers.every(
        (o) => o.providerId === "iranserver" && o.country === "DE",
      ),
    ),
  );
  // The API accepts and validates the country parameter.
  assert.equal(searchParams.parse({ country: "tr" }).country, "TR");
  assert.equal(searchParams.safeParse({ country: "XX" }).success, false);
  assert.equal(searchParams.parse({ region: "other" }).region, "other");
});

test("legacy rows gain countries from what their pages state; groups expose countries", () => {
  const legacy = (sourceId, region) => locate({ sourceId, region, id: "x" });
  assert.deepEqual(legacy("liara", "ir").countries, ["IR"]);
  assert.deepEqual(legacy("mehrhost-host", "eu").countries, ["DE"]);
  assert.deepEqual(legacy("mizbanfa-host", "eu").countries, ["DE"]);
  assert.deepEqual(legacy("webramz-vps-eu", "eu").countries, ["DE", "FI"]);
  assert.equal(legacy("webramz-vps-eu", "eu").country, null);
  assert.deepEqual(legacy("netafraz-host", "eu").countries, []);
  assert.deepEqual(legacy("saba-host", "unknown").countries, []);
  const list = catalogCountries(baseline);
  assert.equal(list[0].code, "IR");
  for (const code of ["DE", "FI", "FR", "NL", "GB", "TR", "US", "CA", "AE"])
    assert.ok(
      list.some((c) => c.code === code && c.offers > 0),
      code,
    );
  // Groups keep the legacy id format, so saved choices stay valid.
  const g = search("سرور آمریکا").groups[0];
  assert.match(g.id, /^vps-other-/);
  assert.ok(g.countries.includes("US"));
});

test("a failing foreign page keeps its offers; the other pages still refresh", async () => {
  const dir = mkdtempSync(join(tmpdir(), "abrgozin-foreign-"));
  try {
    const store = createStore(dir);
    const before = store
      .offers()
      .filter((o) => o.sourceId === "parsvds-vps-tr");
    assert.equal(before.length, 7);
    const byUrl = new Map(foreignSources.map((s) => [s.url, s.id]));
    const fetchPage = async (url) => {
      const id = byUrl.get(url);
      if (!id || id === "parsvds-vps-tr") throw new Error("fetch failed");
      return fixture(id);
    };
    const status = await refreshSources(store, () => {}, fetchPage);
    const state = (id) => status.find((s) => s.id === id);
    assert.equal(state("parsvds-vps-tr").state, "error");
    assert.equal(
      store.offers().filter((o) => o.sourceId === "parsvds-vps-tr").length,
      7,
    );
    for (const s of foreignSources.filter((s) => s.id !== "parsvds-vps-tr"))
      assert.equal(state(s.id).state, "ok", s.id);
    // Every other source failed too and kept its rows.
    assert.equal(store.offers().length, baseline.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

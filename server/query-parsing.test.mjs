import test from "node:test";
import assert from "node:assert/strict";
import baseline from "./baseline.json" with { type: "json" };
import {
  convertNumberWords,
  norm,
  parseQuery,
  searchOffers,
} from "./pricing.mjs";

const fields = (q) => parseQuery(q).fields;
const search = (q, extra = {}) =>
  searchOffers(baseline, { q, traffic: 200, ip: true, ...extra });

test("F1: foreign and negated locations map to the eu region before the Iran check", () => {
  for (const q of [
    "سرور خارج از ایران",
    "سرور خارج کشور",
    "سرور خارجی",
    "هاست غیر ایرانی",
    "سرور بیرون از ایران",
    "vps outside iran",
    "non-iran vps",
    "هاست اروپا",
    "سرور آلمان",
    "هاست هلند",
    "سرور فنلاند",
  ])
    assert.equal(fields(q).region, "eu", q);
  for (const q of ["سرور ایران", "هاست داخلی", "سرور ايراني"])
    assert.equal(fields(q).region, "ir", q);
});

test("F1: provider names containing «ایران» set the provider, not the region", () => {
  for (const [q, provider] of [
    ["ایران سرور", "iranserver"],
    ["ایرانسرور ۴ گیگ", "iranserver"],
    ["ایران‌سرور", "iranserver"],
    ["IranServer vps", "iranserver"],
    ["ایران هاست", "iranhost"],
    ["ایران‌هاست سرور مجازی", "iranhost"],
  ]) {
    const parsed = fields(q);
    assert.equal(parsed.provider, provider, q);
    assert.equal(parsed.region, undefined, q);
  }
  // The provider's name is not a service keyword either: IranHost sells VPS.
  assert.equal(fields("ایران هاست").type, undefined);
  assert.equal(fields("ایران‌هاست سرور مجازی").type, "vps");
  // A location stated separately still applies.
  assert.equal(fields("ایرانسرور با دیتاسنتر ایران").region, "ir");
  // A provider named in the text is not overridden by the intent model.
  const result = search("ایران هاست");
  assert.ok(result.groups.length > 0);
  assert.ok(
    result.groups.every((g) =>
      g.offers.every((o) => o.providerId === "iranhost"),
    ),
  );
  const scored = searchOffers(
    baseline,
    { q: "ایران هاست", traffic: 200, ip: true },
    { hosting: 0.9, vps: 0.1 },
  );
  assert.equal(scored.intent.semanticType, undefined);
  assert.ok(scored.groups.length > 0);
  // «server iran» is not the Server.ir provider.
  assert.equal(fields("server iran").provider, undefined);
});

test("F3: currency units and budget triggers", () => {
  for (const [q, maxPrice] of [
    ["سرور زیر ۲۰ میلیون ریال", 2000000],
    ["هاست حداکثر ۵۰۰ هزار تومان", 500000],
    ["سرور تا ۱٫۵ میلیون", 1500000],
    ["هاست بودجه ماهانه ۸۰۰ هزار", 800000],
    ["سرور کمتر از ۲ میلیون تومن", 2000000],
    ["هاست نهایتاً ۳۰۰ هزار تومن", 300000],
    ["هاست نهایتا ۳۰۰ هزار", 300000],
    ["سرور ماهی ۱ میلیون", 1000000],
    ["سرور زیر 2M", 2000000],
    ["هاست زیر 300K", 300000],
    ["سرور زیر ۲۰۰۰۰۰۰۰ ریال", 2000000],
    ["سرور ملیون", undefined],
  ])
    assert.equal(fields(q).maxPrice, maxPrice, q);
  const parsed = parseQuery("سرور زیر ۲۰ میلیون ریال");
  assert.equal(parsed.budgetAssumed, false);
  assert.equal(parsed.budgetUnit, "million-rial");
  // Resource amounts and durations after «تا» are not prices.
  for (const q of ["سرور تا ۴ گیگ رم", "هاست تا ۳ ماه", "هاست تا ۵ سایت"])
    assert.equal(fields(q).maxPrice, undefined, q);
});

test("F4: unit-less budgets pick the plausible scale from the live catalog", () => {
  for (const [q, maxPrice, unit] of [
    ["هاست زیر ۵۰۰", 500000, "thousand-toman"],
    ["هاست زیر ۵۰", 50000, "thousand-toman"],
    ["سرور زیر ۲", 2000000, "million-toman"],
    ["سرور زیر ۸۰۰", 800000, "thousand-toman"],
    // Colloquial «تومن» after a small number means thousands or millions too.
    ["هاست زیر ۲۰۰ تومن", 200000, "thousand-toman"],
    // ×1e3 would be below every VPS in the catalog; ×1e6 is inside its range.
    ["سرور زیر ۳۰", 30000000, "million-toman"],
  ]) {
    const result = search(q);
    assert.equal(result.filters.maxPrice, maxPrice, q);
    assert.equal(result.intent.budgetAssumed, true, q);
    assert.equal(result.intent.budgetUnit, unit, q);
    assert.ok(result.groups.length > 0, q);
    assert.ok(
      result.groups.every((g) =>
        g.offers.every((o) => o.estimate.total <= maxPrice),
      ),
      q,
    );
  }
  // 10,000 or more without a unit is toman, and still flagged as an assumption.
  const large = search("هاست زیر 150000");
  assert.equal(large.filters.maxPrice, 150000);
  assert.equal(large.intent.budgetAssumed, true);
  assert.equal(large.intent.budgetUnit, "toman");
  // An explicit unit is not an assumption.
  const explicit = search("هاست حداکثر ۵۰۰ هزار تومان");
  assert.equal(explicit.intent.budgetAssumed, false);
  assert.equal(explicit.intent.budgetUnit, "thousand-toman");
  // Neither candidate plausible: ×1e3 from 20 up, ×1e6 below 20.
  const tiny = [{ ...baseline.find((o) => o.type === "vps"), price: 5e8 }];
  assert.equal(
    searchOffers(tiny, { q: "سرور زیر ۵۰", traffic: 0, ip: false }).filters
      .maxPrice,
    50000,
  );
  assert.equal(
    searchOffers(tiny, { q: "سرور زیر ۵", traffic: 0, ip: false }).filters
      .maxPrice,
    5000000,
  );
  // An explicit maxPrice still wins over the text.
  assert.equal(
    search("هاست زیر ۵۰۰", { maxPrice: 900000 }).filters.maxPrice,
    900000,
  );
});

test("F5: Persian number words for budgets and resources", () => {
  for (const [q, maxPrice] of [
    ["سرور زیر دو میلیون", 2000000],
    ["سرور تا یک و نیم میلیون", 1500000],
    ["هاست زیر نیم میلیون", 500000],
    ["هاست حداکثر پونصد هزار تومن", 500000],
    ["هاست تا سیصد و پنجاه هزار", 350000],
    ["سرور زیر دو میلیون و پانصد هزار", 2500000],
    ["سرور زیر یک میلیون و نیم", 1500000],
  ])
    assert.equal(fields(q).maxPrice, maxPrice, q);
  assert.equal(fields("سرور با چهار گیگ رم").ram, 4);
  assert.deepEqual(fields("سرور مجازی دو هسته چهار گیگ رم"), {
    cpu: 2,
    ram: 4,
    type: "vps",
  });
  assert.equal(fields("سرور بیست و پنج گیگ دیسک").disk, 25);
  // Words that are not amounts stay untouched.
  assert.equal(
    convertNumberWords(norm("نه، هاست با سی پنل")),
    "نه، هاست با سی پنل",
  );
  assert.equal(convertNumberWords(norm("یک سایت وردپرس")), "یک سایت وردپرس");
  // A resource after an amount is not merged into it.
  assert.deepEqual(fields("سرور زیر ۵۰۰ هزار و ۲ گیگ رم"), {
    ram: 2,
    type: "vps",
    maxPrice: 500000,
  });
});

test("F6: website purposes apply the WordPress scenario floors", () => {
  for (const [q, scenario, disk] of [
    ["هاست برای سایت فروشگاهی", "store", 10],
    ["هاست فروشگاه اینترنتی", "store", 10],
    ["هاست فروشگاه آنلاین", "store", 10],
    ["hosting for online shop", "store", 10],
    ["ecommerce hosting", "store", 10],
    ["سایت فروشگاهی کوچک", "store", 10],
    ["هاست برای وبلاگ", "blog", 5],
    ["هاست سایت خبری", "blog", 5],
    ["هاست سایت محتوایی", "blog", 5],
    ["هاست سایت شرکتی", "business", 5],
  ]) {
    const result = search(q);
    assert.equal(result.filters.workload, "wordpress", q);
    assert.equal(result.filters.scenario, scenario, q);
    assert.equal(result.requirements.minimum.disk, disk, q);
    assert.ok(result.groups.length > 0, q);
    assert.ok(
      result.groups.every((g) => g.type === "hosting" && g.disk >= disk),
      q,
    );
  }
  // The repro: the top result is no longer a 100 MB host.
  assert.ok(search("هاست برای سایت فروشگاهی").groups[0].disk >= 10);
  // An explicit workload selection wins.
  const explicit = search("هاست برای سایت فروشگاهی", { workload: "website" });
  assert.equal(explicit.filters.workload, "website");
  assert.equal(explicit.filters.scenario, undefined);
  // A purpose alone does not turn a VPS search into WordPress.
  const vps = search("سرور برای فروشگاه اینترنتی");
  assert.equal(vps.filters.type, "vps");
  assert.equal(vps.filters.workload, undefined);
  // «storage» is not «store».
  assert.equal(search("hosting with more storage").filters.workload, undefined);
});

test("needsIntentModel is false exactly when intent scores cannot change the result", async () => {
  const { needsIntentModel } = await import("./pricing.mjs");
  const { readFileSync } = await import("node:fs");
  const read = (name) =>
    JSON.parse(
      readFileSync(new URL(`../eval/${name}`, import.meta.url), "utf8"),
    ).queries;
  const queries = [
    ...read("golden-queries.json").map((x) => x.q),
    ...read("intent-labeled.json").map((x) => x.q),
  ];
  const view = (r) =>
    JSON.stringify([r.groups.map((g) => g.id), r.filters, r.emptyReason]);
  let skipped = 0;
  for (const q of queries)
    for (const extra of [{}, { type: "hosting" }, { workload: "docker" }]) {
      const p = { q, traffic: 200, ip: true, ...extra };
      if (needsIntentModel(p)) continue;
      skipped++;
      const none = view(searchOffers(baseline, p, {}));
      assert.equal(
        view(searchOffers(baseline, p, { vps: 0.99, hosting: 0 })),
        none,
        q,
      );
      assert.equal(
        view(searchOffers(baseline, p, { hosting: 0.99, vps: 0 })),
        none,
        q,
      );
    }
  assert.ok(skipped > 100);
  assert.equal(needsIntentModel({ q: "میخوام ربات تلگرام اجرا کنم" }), true);
  assert.equal(needsIntentModel({ q: "سرور با ۸ گیگ رم" }), false);
  assert.equal(needsIntentModel({ q: "ایران هاست" }), false);
  assert.equal(needsIntentModel({ q: "" }), false);
});

test("A bare size is disk for hosting and RAM for a server", () => {
  for (const [q, expected] of [
    ["هاست ۱۰ گیگ", { type: "hosting", disk: 10 }],
    ["هاست وردپرس ۲ گیگابایت", { type: "hosting", disk: 2 }],
    ["سرور مجازی ۲ هسته ۴ گیگ", { type: "vps", cpu: 2, ram: 4 }],
    ["سرور ۴ گیگ رم ۸۰ گیگ", { type: "vps", ram: 4, disk: 80 }],
    ["سرور 4gb", { type: "vps", ram: 4 }],
    ["سرور ۲ گیگ رم با ۲۰۰ گیگ ترافیک", { type: "vps", ram: 2 }],
  ])
    assert.deepEqual(fields(q), expected, q);
  // Without a service type the size stays ambiguous.
  assert.deepEqual(fields("ایرانسرور ۴ گیگ"), { provider: "iranserver" });
  // The repro: a 0.1 GB host no longer leads «هاست ۱۰ گیگ».
  const host = search("هاست ۱۰ گیگ");
  assert.ok(host.groups.length > 0);
  assert.ok(host.groups.every((g) => g.type === "hosting" && g.disk >= 10));
});

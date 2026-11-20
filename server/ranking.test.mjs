import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import baseline from "./baseline.json" with { type: "json" };
import { searchOffers } from "./pricing.mjs";
import { dominates, paretoOrder, paretoViolations } from "./pareto.mjs";

const golden = JSON.parse(
  readFileSync(new URL("../eval/golden-queries.json", import.meta.url), "utf8"),
).queries;
const vps = baseline.find((o) => o.providerId === "arvan" && o.type === "vps");
const plan = (id, cpu, ram, disk, price) => ({
  ...vps,
  id,
  cpu,
  ram,
  disk,
  price,
  ipMonthly: 0,
  vatRate: null,
  region: "ir",
});
const ids = (result) => result.groups.map((g) => g.offers[0].id);

test("F7 repro: a stronger and cheaper plan ranks above weaker, pricier plans", () => {
  const offers = [
    plan("weak-expensive", 2, 4, 40, 1590000),
    plan("strong-cheap", 4, 4, 60, 882000),
    plan("strongest", 8, 8, 120, 1588500),
  ];
  const query = {
    q: "سرور ایران برای داکر با ۴ گیگ رم زیر ۲ میلیون",
    traffic: 0,
    ip: false,
  };
  const ranked = searchOffers(offers, query);
  assert.deepEqual(ids(ranked), [
    "strong-cheap",
    "strongest",
    "weak-expensive",
  ]);
  assert.deepEqual(paretoViolations(ranked.groups), []);
  // Proximity stays available as an explicit option.
  const fit = searchOffers(offers, { ...query, sort: "fit" });
  assert.deepEqual(ids(fit), ["weak-expensive", "strong-cheap", "strongest"]);
  assert.equal(fit.filters.sort, "fit");
  assert.ok(paretoViolations(fit.groups).length > 0);
});

test("F7 invariant: 0 Pareto violations under the default sort for every golden query", () => {
  for (const item of golden)
    for (const extra of [{}, { traffic: 0, ip: false }]) {
      const result = searchOffers(baseline, {
        q: item.q,
        traffic: 200,
        ip: true,
        ...extra,
      });
      assert.deepEqual(paretoViolations(result.groups), [], item.q);
      for (let i = 1; i < result.groups.length; i++)
        assert.ok(result.groups[i - 1].min <= result.groups[i].min, item.q);
    }
  // The whole catalog, per service category, is also violation-free.
  for (const type of ["all", "vps", "hosting"])
    assert.deepEqual(
      paretoViolations(searchOffers(baseline, { type }).groups),
      [],
      type,
    );
});

test("Equal prices: more resources first, unknown resources never jump a dominating plan", () => {
  const group = (id, min, cpu, ram, disk) => ({ id, min, cpu, ram, disk });
  // Random complete configurations: sorted output never has a violation.
  let seed = 7;
  const rand = (n) => (seed = (seed * 48271) % 2147483647) % n;
  for (let round = 0; round < 200; round++) {
    const groups = Array.from({ length: 12 }, (_, i) =>
      group(
        `g${i}`,
        100 * (1 + rand(3)),
        1 + rand(4),
        1 + rand(4),
        10 * (1 + rand(4)),
      ),
    ).sort((a, b) => a.min - b.min);
    assert.deepEqual(paretoViolations(paretoOrder(groups)), []);
  }
  // Partially unknown resources: hosting with disk only vs a VPS at one price.
  const ordered = paretoOrder([
    group("vps", 100, 2, 2, 20),
    group("host", 100, null, null, 50),
  ]);
  assert.ok(dominates(ordered[0], ordered[1]));
  assert.deepEqual(paretoViolations(ordered), []);
});

import test from "node:test";
import assert from "node:assert/strict";
import baseline from "./baseline.json" with { type: "json" };
import { searchOffers } from "./pricing.mjs";

const base = baseline.find((o) => o.providerId === "liara" && o.type === "vps");
const plan = (id, changes = {}) => ({
  ...base,
  id,
  cpu: 2,
  ram: 4,
  disk: 40,
  price: 100000,
  ipMonthly: 0,
  ...changes,
});
const params = {
  type: "vps",
  region: "ir",
  cpu: 2,
  ram: 4,
  disk: 40,
  traffic: 0,
  ip: false,
};

test("Selected resource amounts are equal in exact results; closest real alternatives come separately", () => {
  const data = searchOffers(
    [
      plan("exact"),
      plan("near-disk", { disk: 45, price: 200000 }),
      plan("near-ram", { ram: 8, price: 1000 }),
      plan("smaller", { ram: 2 }),
      plan("far", { ram: 16 }),
      plan("unknown", { ram: null }),
    ],
    params,
  );
  assert.equal(data.groups.length, 1);
  assert.equal(data.groups[0].offers[0].id, "exact");
  assert.equal(data.totalOffers, 1);
  assert.equal(
    data.similarGroups[0].offers[0].id,
    "near-disk",
    "closeness precedes price",
  );
  assert.deepEqual(data.similarGroups[0].differences, [
    { field: "disk", requested: 40, actual: 45 },
  ]);
  assert.ok(
    data.similarGroups.some((g) => g.ram === 2),
    "smaller alternative has an explicit difference",
  );
  assert.ok(data.similarGroups.every((g) => g.ram !== null && g.ram !== 16));
  assert.ok(
    !data.similarGroups.some((g) =>
      data.groups.some((exact) => exact.id === g.id),
    ),
  );
});

test("Location, provider, service category and estimated budget stay binding for similar results", () => {
  const data = searchOffers(
    [
      plan("near", { ram: 8 }),
      plan("budget", { ram: 8, disk: 45, price: 500000 }),
      plan("foreign", { ram: 8, region: "eu" }),
      plan("seller", { ram: 8, providerId: "arvan" }),
      plan("host", { ram: 8, type: "wordpress" }),
    ],
    { ...params, provider: "liara", maxPrice: 200000 },
  );
  assert.equal(data.groups.length, 0);
  assert.equal(data.similarGroups.length, 1);
  assert.equal(data.similarGroups[0].offers[0].id, "near");
});

test("Unselected dimensions stay unrestricted; all-services discovery preserves the whole catalog", () => {
  const data = searchOffers([plan("one"), plan("other-cpu", { cpu: 4 })], {
    ram: 4,
  });
  assert.equal(data.groups.length, 2);
  assert.equal(data.similarGroups.length, 0);
  const all = searchOffers(baseline, { type: "all" });
  assert.equal(all.totalOffers, baseline.length);
  assert.equal(all.similarGroups.length, 0);
  assert.equal(
    new Set(all.groups.flatMap((g) => g.offers.map((o) => o.providerId))).size,
    20,
  );
});

test("Explicit selections override text; a cleared resource can override a text-derived value", () => {
  const offers = [plan("four"), plan("eight", { ram: 8 })];
  const exact = searchOffers(offers, { q: "سرور ۸ گیگ رم", ram: 4 });
  assert.ok(exact.groups.every((g) => g.ram === 4));
  const cleared = searchOffers(offers, { q: "سرور ۸ گیگ رم", ram: "all" });
  assert.equal(cleared.groups.length, 2);
  assert.deepEqual(cleared.resourceFilters, {});
});

test("No exact match can still yield explained alternatives; remote matches and unknown RAM are excluded", () => {
  const data = searchOffers(
    [
      plan("close"),
      plan("unknown", { ram: null }),
      plan("remote", { disk: 200 }),
    ],
    { ...params, ram: 3 },
  );
  assert.equal(data.groups.length, 0);
  assert.equal(data.similarGroups.length, 1);
  assert.deepEqual(data.similarGroups[0].differences, [
    { field: "ram", requested: 3, actual: 4 },
  ]);
  const saved = searchOffers([plan("close"), plan("other", { ram: 2 })], {
    ...params,
    ram: 3,
    saved: ["vps-ir-2-4-40"],
  });
  assert.equal(saved.similarGroups.length, 1);
  assert.equal(saved.similarGroups[0].ram, 4);
});

test("Structured workloads constrain exact and similar offers without adding resource requirements", () => {
  const offers = [
    plan("server"),
    plan("near-server", { disk: 50 }),
    plan("host", { type: "hosting" }),
    plan("near-host", { type: "hosting", disk: 50 }),
    plan("wordpress", { type: "wordpress" }),
  ];
  for (const workload of ["docker", "backend", "python", "database"]) {
    const result = searchOffers(offers, { ...params, type: "all", workload });
    assert.deepEqual(
      result.groups.flatMap((g) => g.offers.map((o) => o.id)),
      ["server"],
    );
    assert.deepEqual(
      result.similarGroups.flatMap((g) => g.offers.map((o) => o.id)),
      ["near-server"],
    );
    const unrestricted = searchOffers(offers, { type: "all", workload });
    assert.equal(unrestricted.totalOffers, 2);
    assert.deepEqual(unrestricted.resourceFilters, {});
  }
  const wordpress = searchOffers(offers, {
    ...params,
    type: "all",
    workload: "wordpress",
  });
  assert.equal(wordpress.totalOffers, 2);
  assert.ok(
    [...wordpress.groups, ...wordpress.similarGroups].every(
      (g) => g.type === "hosting",
    ),
  );
  const incompatible = searchOffers(offers, {
    ...params,
    type: "hosting",
    workload: "docker",
  });
  assert.equal(incompatible.totalOffers, 0);
  assert.equal(incompatible.similarGroups.length, 0);
  assert.equal(
    searchOffers(offers, { type: "all", workload: "all" }).totalOffers,
    offers.length,
  );
});

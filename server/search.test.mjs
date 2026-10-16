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
    22,
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

test("Structured workloads constrain exact and similar offers and apply workload capacity requirements", () => {
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

test("Multiple selected providers are ORed while resources, location and budget remain binding", () => {
  const data = searchOffers(
    [
      plan("liara", { providerId: "liara" }),
      plan("arvan", { providerId: "arvan" }),
      plan("excluded", { providerId: "iranserver" }),
      plan("foreign", { providerId: "liara", region: "eu" }),
      plan("expensive", { providerId: "arvan", price: 500000 }),
      plan("similar", { providerId: "arvan", ram: 8 }),
    ],
    { ...params, provider: ["liara", "arvan"], maxPrice: 200000 },
  );
  assert.deepEqual(data.groups[0].offers.map((o) => o.id).sort(), [
    "arvan",
    "liara",
  ]);
  assert.deepEqual(
    data.similarGroups.flatMap((g) => g.offers.map((o) => o.id)),
    ["similar"],
  );
});
test("Descending and ascending prices order the displayed minimum for each configuration", () => {
  const offers = [
    plan("one", { ram: 1, price: 300000 }),
    plan("two", { ram: 2, price: 200000 }),
    plan("three", { ram: 4, price: 100000 }),
    plan("same-group-costly", { ram: 4, price: 900000 }),
  ];
  for (const [sort, expected] of [
    ["price", [100000, 200000, 300000]],
    ["price-desc", [300000, 200000, 100000]],
  ]) {
    const result = searchOffers(offers, { sort, ip: false, traffic: 0 });
    assert.deepEqual(
      result.groups.map((g) => g.min),
      expected,
    );
    assert.equal(result.groups.find((g) => g.ram === 4).offers[0].id, "three");
  }
});
test("Dedicated servers never enter hosting or VPS results, and an empty dedicated catalog stays empty", () => {
  const dedicated = plan("dedicated", { type: "dedicated" });
  const mixed = [base, dedicated, plan("hosting", { type: "wordpress" })];
  assert.deepEqual(
    searchOffers(mixed, { type: "dedicated" }).groups.map((g) => g.serviceType),
    ["dedicated"],
  );
  for (const type of ["hosting", "vps"])
    assert.ok(
      searchOffers(mixed, { type }).groups.every(
        (g) => g.serviceType !== "dedicated",
      ),
    );
  assert.equal(searchOffers(baseline, { type: "dedicated" }).totalOffers, 0);
  assert.equal(
    searchOffers(mixed, { q: "سرور اختصاصی" }).groups[0].serviceType,
    "dedicated",
  );
});

test("WordPress floors exclude tiny or unknown plans from exact and nearby results", () => {
  const offers = [
    plan("tiny", { type: "hosting", disk: 0.1 }),
    plan("blog", { type: "hosting", disk: 6, ram: 1 }),
    plan("store", { type: "wordpress", disk: 20, ram: 2 }),
    plan("unknown", { type: "hosting", disk: 50, ram: null }),
  ];
  const result = searchOffers(offers, { workload: "wordpress", disk: 6 });
  assert.deepEqual(
    result.groups.flatMap((g) => g.offers.map((o) => o.id)),
    ["blog"],
  );
  assert.ok(
    [...result.groups, ...result.similarGroups].every(
      (g) => g.disk >= 5 && g.ram >= 1,
    ),
  );
  assert.equal(result.requirements.excludedOffers, 2);
  const store = searchOffers(offers, {
    workload: "wordpress",
    scenario: "store",
  });
  assert.deepEqual(
    store.groups.flatMap((g) => g.offers.map((o) => o.id)),
    ["store"],
  );
  assert.equal(
    searchOffers(offers, { q: "هاست وردپرس فروشگاهی" }).requirements.minimum
      .disk,
    10,
  );
  assert.equal(
    searchOffers(offers, { q: "وردپرس" }).requirements.minimum.disk,
    5,
  );
});
test("Capacity planning, explicit bounds, GPU and minimum mode remain binding", () => {
  const offers = [
    plan("twenty", { disk: 20 }),
    plan("forty", { disk: 40 }),
    plan("eighty", { disk: 80, ram: 8 }),
  ];
  const sizing = searchOffers(offers, {
    workload: "docker",
    dataGB: 10,
    growthGB: 5,
    backupCopies: 1,
  });
  assert.equal(sizing.requirements.minimum.disk, 63);
  assert.deepEqual(
    sizing.groups.flatMap((g) => g.offers.map((o) => o.id)),
    ["eighty"],
  );
  const exact = searchOffers(offers, { workload: "docker", disk: 20 });
  assert.equal(exact.groups.length, 0);
  assert.ok(exact.requirements.conflicts.length);
  assert.ok(exact.similarGroups.every((g) => g.disk >= 25));
  const minimum = searchOffers(offers, {
    disk: 40,
    ram: 4,
    resourceMode: "minimum",
  });
  assert.equal(minimum.totalOffers, 2);
  assert.equal(minimum.similarGroups.length, 0);
  assert.equal(searchOffers(offers, { gpu: true }).totalOffers, 0);
  assert.equal(searchOffers(offers, { minRam: 8 }).totalOffers, 1);
  const raw = searchOffers(offers, { type: "vps", workload: "wordpress" });
  assert.equal(raw.requirements.minimum.disk, 25);
  assert.ok(raw.groups.every((g) => g.type === "vps"));
});

test("Redis and AI models need a specified memory requirement before shortlisting", () => {
  const offers = [plan("ordinary"), plan("larger", { ram: 16 })];
  for (const [workload, scenario] of [
    ["database", "redis"],
    ["python", "ml"],
  ]) {
    const unknown = searchOffers(offers, { workload, scenario });
    assert.equal(unknown.totalOffers, 0);
    assert.equal(unknown.similarGroups.length, 0);
    assert.ok(unknown.requirements.blockers.length);
    assert.equal(
      searchOffers(offers, { workload, scenario, minRam: 8 }).totalOffers,
      1,
    );
  }
});

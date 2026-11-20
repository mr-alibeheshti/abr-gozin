import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import baseline from "./baseline.json" with { type: "json" };
import { expandedSources } from "./expanded-catalog.mjs";
import { parseExpanded } from "./expanded-ingest.mjs";
import { estimate, searchOffers } from "./pricing.mjs";

const source = expandedSources.find((s) => s.id === "webramz-vps-eu");
const html = readFileSync(
  new URL("./fixtures/webramz-vps-eu.html", import.meta.url),
  "utf8",
);

test("F2: Webramz's official Germany/Finland VPS page yields verified eu offers", () => {
  assert.equal(source.providerId, "webramz");
  assert.equal(new URL(source.url).hostname, "webramz.com");
  const offers = parseExpanded(source, html, "2026-11-20T14:37:46.000Z");
  assert.deepEqual(
    offers.map((o) => [o.id, o.cpu, o.ram, o.disk, o.price]),
    [
      ["webramz-eu-HCVPS-20", 1, 1, 20, 2205000],
      ["webramz-eu-HCVPS-30", 2, 2, 30, 2867000],
      ["webramz-eu-HCVPS-40", 3, 3, 40, 3726000],
      ["webramz-eu-HCVPS-50", 4, 4, 50, 4844000],
    ],
  );
  for (const o of offers) {
    assert.equal(o.region, "eu");
    assert.equal(o.type, "vps");
    assert.equal(o.trafficUnlimited, true);
    assert.equal(o.ipMonthly, 0);
    assert.equal(o.billing, "monthly");
    assert.match(
      o.checkoutUrl,
      /^https:\/\/my\.webramz\.com\/cart\.php\?a=add&pid=\d+$/,
    );
    assert.equal(estimate(o, { traffic: 200, ip: true }).total, o.price);
  }
  // Iran-page markup or a different location must not be accepted silently.
  assert.throws(() =>
    parseExpanded(source, html.replaceAll("آلمان / فنلاند", "ایران"), "x"),
  );
});

test("F2: foreign VPS queries return verified European plans, Webramz included", () => {
  for (const q of ["سرور مجازی آلمان", "سرور خارج از ایران", "vps europe"]) {
    const result = searchOffers(baseline, { q, traffic: 200, ip: true });
    assert.ok(result.groups.length > 0, q);
    assert.equal(result.emptyReason, null, q);
    assert.ok(
      result.groups.every((g) => g.type === "vps" && g.region === "eu"),
      q,
    );
    assert.ok(
      result.groups.some((g) =>
        g.offers.some((o) => o.providerId === "webramz"),
      ),
      q,
    );
  }
  // «آلمان» keeps only plans whose official page names Germany (Webramz
  // names «آلمان / فنلاند»).
  const germany = searchOffers(baseline, { q: "سرور مجازی آلمان" });
  assert.equal(germany.filters.country, "DE");
  assert.ok(
    germany.groups.every((g) =>
      g.offers.every((o) => o.countries.includes("DE")),
    ),
  );
  // Docker floors (25 GB disk) still bind foreign plans; «هلند» is the
  // Netherlands only.
  const docker = searchOffers(baseline, {
    q: "سرور مجازی هلند برای داکر",
    traffic: 200,
    ip: true,
  });
  assert.ok(docker.groups.length > 0);
  assert.ok(
    docker.groups.every(
      (g) => g.disk >= 25 && g.offers.every((o) => o.country === "NL"),
    ),
  );
});

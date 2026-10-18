import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createSemanticEngine } from "./semantic.mjs";
import { searchOffers } from "./pricing.mjs";
import baseline from "./baseline.json" with { type: "json" };
test("Actual local multilingual model retrieves a grounded category and rejects gibberish", async () => {
  const engine = createSemanticEngine();
  for (let i = 0; i < 200 && engine.status.state === "loading"; i++)
    await delay(50);
  assert.equal(engine.status.state, "ready");
  const scores = await engine.scores("راه اندازی بک اند اپ موبایل");
  assert.ok(scores.vps > scores.hosting);
  assert.ok(scores.vps > 0.4);
  const results = searchOffers(
    baseline,
    { q: "راه اندازی بک اند اپ موبایل", type: "all", traffic: 200, ip: true },
    scores,
  );
  assert.ok(results.groups.length > 0);
  assert.ok(results.groups.every((g) => g.type === "vps"));
  // No service keyword: classification must come from the actual model, even
  // when a numeric budget has already been extracted by the query parser.
  const descriptiveQuery =
    "می خواهم کد برنامه ام همیشه آنلاین اجرا شود زیر ۲ میلیون";
  const semantic = searchOffers(
    baseline,
    { q: descriptiveQuery, type: "all", traffic: 200, ip: true },
    await engine.scores(descriptiveQuery),
  );
  assert.equal(semantic.intent.semanticType, "vps");
  assert.ok(semantic.groups.length > 0);
  assert.ok(
    semantic.groups.every(
      (g) =>
        g.type === "vps" && g.offers.every((o) => o.estimate.total <= 2000000),
    ),
  );
  const nonsensical = "قغفهبثضصفص";
  const none = searchOffers(
    baseline,
    { q: nonsensical, type: "all", traffic: 200, ip: true },
    await engine.scores(nonsensical),
  );
  assert.equal(none.groups.length, 0);
});

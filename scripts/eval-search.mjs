#!/usr/bin/env node
// Golden-set evaluation for GET /api/search.
// Usage: node scripts/eval-search.mjs --base http://127.0.0.1:4321 --out eval/results-local.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { paretoViolations } from "../server/pareto.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, arg, i, all) =>
      arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []),
);
const base = String(args.base || "http://127.0.0.1:4321").replace(/\/$/, "");
const runs = Math.max(1, Number(args.runs || 5));
const goldenPath = resolve(root, args.golden || "eval/golden-queries.json");
const out = args.out ? resolve(root, args.out) : null;
const timeoutMs = Number(args.timeout || 30000);

const unset = (v) => v === undefined || v === null || v === "" || v === "all";
const providerList = (v) =>
  (Array.isArray(v) ? v : String(v ?? "").split(",")).filter(Boolean);

export function compareExpect(expect = {}, filters = {}) {
  const mismatches = [];
  for (const [field, want] of Object.entries(expect)) {
    const got = filters[field];
    let ok;
    if (want === null) ok = unset(got);
    else if (field === "provider") ok = providerList(got).includes(want);
    else if (typeof want === "number") ok = !unset(got) && Number(got) === want;
    else ok = got === want;
    if (!ok) mismatches.push({ field, want, got: got ?? null });
  }
  return mismatches;
}

export function runCheck(name, data) {
  const [kind, arg] = name.split(":");
  const groups = data.groups || [];
  const offers = groups.flatMap((g) => g.offers || []);
  switch (kind) {
    case "nonEmpty":
      return { ok: groups.length > 0, detail: `${groups.length} groups` };
    case "allWithinBudget": {
      const max = data.filters?.maxPrice;
      if (unset(max)) return { ok: false, detail: "no maxPrice applied" };
      const over = offers.filter((o) => o.estimate.total > Number(max));
      return { ok: over.length === 0, detail: `${over.length} offers over ${max}` };
    }
    case "minDiskAtLeast": {
      const low = groups.filter((g) => !(g.disk >= Number(arg)));
      return {
        ok: low.length === 0,
        detail: low.length ? `${low.length} groups below ${arg} GB (first: ${low[0].disk})` : "ok",
      };
    }
    case "regionIs": {
      const other = groups.filter((g) => g.region !== arg);
      return { ok: other.length === 0, detail: `${other.length} groups outside ${arg}` };
    }
    case "countryIs": {
      // Offers must name the country, or name none (a page that only says
      // «اروپا»); offers from responses without countries fail.
      const other = offers.filter(
        (o) => !(Array.isArray(o.countries) && (o.countries.includes(arg) || o.countries.length === 0)),
      );
      return { ok: other.length === 0, detail: `${other.length} offers outside ${arg}` };
    }
    case "typeIs": {
      const other = groups.filter((g) => g.type !== arg);
      return { ok: other.length === 0, detail: `${other.length} groups not ${arg}` };
    }
    case "paretoConsistent": {
      const v = paretoViolations(groups);
      return { ok: v.length === 0, detail: `${v.length} violations` };
    }
    case "explicitEmptyReason":
      return groups.length
        ? { ok: true, detail: "non-empty" }
        : { ok: Boolean(data.emptyReason), detail: data.emptyReason || "missing emptyReason" };
    default:
      return { ok: false, detail: `unknown check ${name}` };
  }
}

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

async function fetchSearch(q) {
  const started = performance.now();
  const response = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  const body = await response.text();
  const ms = performance.now() - started;
  let data = null;
  try {
    data = JSON.parse(body);
  } catch {}
  return { status: response.status, ms, data };
}

async function main() {
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  const startedAt = new Date().toISOString();
  const results = [];
  const latencies = [];
  for (const item of golden.queries) {
    let first = null;
    const times = [];
    for (let i = 0; i < runs; i++) {
      try {
        const r = await fetchSearch(item.q);
        times.push(r.ms);
        first ||= r;
      } catch (error) {
        first ||= { status: 0, ms: null, data: null, error: error.message };
      }
    }
    latencies.push(...times);
    const data = first.status === 200 && first.data ? first.data : null;
    const mismatches = data
      ? compareExpect(item.expect, data.filters)
      : [{ field: "http", want: 200, got: first.status }];
    const checks = (item.checks || []).map((name) => ({
      name,
      ...(data ? runCheck(name, data) : { ok: false, detail: `HTTP ${first.status}` }),
    }));
    const violations = data ? paretoViolations(data.groups || []) : [];
    results.push({
      id: item.id,
      group: item.group,
      q: item.q,
      status: first.status,
      parseOk: mismatches.length === 0,
      mismatches,
      checks,
      groups: data?.groups?.length ?? null,
      emptyReason: data?.emptyReason ?? null,
      paretoViolations: violations.length,
      violationExamples: violations.slice(0, 3),
      filters: data
        ? Object.fromEntries(
            ["type", "region", "country", "workload", "scenario", "provider", "ram", "cpu", "disk", "maxPrice"]
              .filter((k) => !unset(data.filters?.[k]))
              .map((k) => [k, data.filters[k]]),
          )
        : null,
      intent: data?.intent ?? null,
      top: (data?.groups || []).slice(0, 3).map((g) => ({
        id: g.id,
        min: g.min,
        cpu: g.cpu,
        ram: g.ram,
        disk: g.disk,
      })),
      latencyMs: times.map((t) => Math.round(t)),
    });
  }
  const parsed = results.filter((r) => Object.keys(
    golden.queries.find((q) => q.id === r.id).expect || {},
  ).length);
  const allChecks = results.flatMap((r) => r.checks);
  const metrics = {
    queries: results.length,
    parseAccuracy: parsed.filter((r) => r.parseOk).length / parsed.length,
    parseScored: parsed.length,
    checkPassRate: allChecks.filter((c) => c.ok).length / allChecks.length,
    checksTotal: allChecks.length,
    checksPassed: allChecks.filter((c) => c.ok).length,
    zeroResultRate: results.filter((r) => r.groups === 0).length / results.length,
    zeroResults: results.filter((r) => r.groups === 0).length,
    paretoViolations: results.reduce((n, r) => n + r.paretoViolations, 0),
    latencyP50Ms: Math.round(percentile(latencies, 50)),
    latencyP95Ms: Math.round(percentile(latencies, 95)),
    requests: latencies.length,
    httpErrors: results.filter((r) => r.status !== 200).length,
  };
  const report = {
    label: args.label || (out ? out.match(/results-([^/]+)\.json$/)?.[1] : null) || "run",
    base,
    runsPerQuery: runs,
    startedAt,
    finishedAt: new Date().toISOString(),
    golden: { path: "eval/golden-queries.json", count: golden.queries.length },
    metrics,
    results,
  };
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  }
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `## Search eval — ${report.label} (${base})`,
    "",
    "| metric | value |",
    "|---|---|",
    `| parse accuracy | ${pct(metrics.parseAccuracy)} (${parsed.filter((r) => r.parseOk).length}/${parsed.length}) |`,
    `| check pass rate | ${pct(metrics.checkPassRate)} (${metrics.checksPassed}/${metrics.checksTotal}) |`,
    `| zero-result rate | ${pct(metrics.zeroResultRate)} (${metrics.zeroResults}/${metrics.queries}) |`,
    `| Pareto violations | ${metrics.paretoViolations} |`,
    `| latency p50 / p95 | ${metrics.latencyP50Ms} / ${metrics.latencyP95Ms} ms (${metrics.requests} requests, ${runs}/query) |`,
    `| HTTP errors | ${metrics.httpErrors} |`,
    "",
  ];
  const failing = results.filter((r) => !r.parseOk || r.checks.some((c) => !c.ok));
  if (failing.length) {
    lines.push("| id | query | parse mismatches | failed checks |", "|---|---|---|---|");
    for (const r of failing)
      lines.push(
        `| ${r.id} | ${r.q} | ${r.mismatches.map((m) => `${m.field}: want ${JSON.stringify(m.want)} got ${JSON.stringify(m.got)}`).join("; ") || "—"} | ${r.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join("; ") || "—"} |`,
      );
  } else lines.push("All golden queries pass.");
  console.log(lines.join("\n"));
  process.exitCode = failing.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();

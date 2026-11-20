#!/usr/bin/env node
// Threshold/margin sweep for the local MiniLM service-intent classifier.
// Usage: node scripts/eval-intent.mjs [--out eval/intent-sweep.json]
// First run downloads the quantized model (about 140 MB) into data/models.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createSemanticEngine } from "../server/semantic.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const out = resolve(root, outArg > 0 ? process.argv[outArg + 1] : "eval/intent-sweep.json");
const labeled = JSON.parse(await readFile(resolve(root, "eval/intent-labeled.json"), "utf8")).queries;
// Thresholds and margins named in the work order; current production pair is 0.4 / 0.03.
const thresholds = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
const margins = [0, 0.02, 0.03, 0.05, 0.08];
const current = { threshold: 0.4, margin: 0.03 };

export function classify(scores, threshold, margin) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > threshold && ranked[0][1] - (ranked[1]?.[1] || 0) > margin
    ? ranked[0][0]
    : null;
}

const engine = createSemanticEngine();
for (let i = 0; i < 3000 && engine.status.state === "loading"; i++) await delay(100);
if (engine.status.state !== "ready") {
  console.error(`Model not ready: ${engine.status.state} ${engine.status.error || ""}`);
  process.exit(2);
}
const scored = [];
for (const item of labeled) scored.push({ ...item, scores: await engine.scores(item.q) });

const none = scored.filter((x) => x.label === "none");
const rows = [];
for (const threshold of thresholds)
  for (const margin of margins) {
    const assigned = scored
      .map((x) => ({ ...x, predicted: classify(x.scores, threshold, margin) }))
      .filter((x) => x.predicted);
    const correct = assigned.filter((x) => x.predicted === x.label).length;
    rows.push({
      threshold,
      margin,
      coverage: assigned.length / scored.length,
      precision: assigned.length ? correct / assigned.length : null,
      falsePositiveRateNone:
        none.filter((x) => classify(x.scores, threshold, margin)).length / none.length,
      assigned: assigned.length,
      correct,
    });
  }
const eligible = rows.filter((r) => r.precision !== null && r.precision >= 0.95);
const best = eligible.sort((a, b) => b.coverage - a.coverage || b.precision - a.precision)[0] || null;
const currentRow = rows.find(
  (r) => r.threshold === current.threshold && r.margin === current.margin,
);
const report = {
  model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2 (q8)",
  queries: scored.length,
  labels: Object.fromEntries(
    ["vps", "hosting", "none"].map((l) => [l, scored.filter((x) => x.label === l).length]),
  ),
  current: currentRow,
  bestAtPrecision95: best,
  rows: rows.sort((a, b) => a.threshold - b.threshold || a.margin - b.margin),
  scores: scored.map((x) => ({
    q: x.q,
    label: x.label,
    vps: Number(x.scores.vps.toFixed(4)),
    hosting: Number(x.scores.hosting.toFixed(4)),
    predictedCurrent: classify(x.scores, current.threshold, current.margin),
  })),
};
await writeFile(out, JSON.stringify(report, null, 2) + "\n");
const pct = (x) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
console.log(`## Intent sweep (n=${scored.length}: ${JSON.stringify(report.labels)})\n`);
console.log("| threshold | margin | coverage | precision | FP rate on none |");
console.log("|---|---|---|---|---|");
for (const r of report.rows)
  console.log(
    `| ${r.threshold.toFixed(2)} | ${r.margin.toFixed(2)} | ${pct(r.coverage)} | ${pct(r.precision)} | ${pct(r.falsePositiveRateNone)} |${r === currentRow ? " ← current" : ""}${r === best ? " ← best ≥95% precision" : ""}`,
  );
process.exit(0);

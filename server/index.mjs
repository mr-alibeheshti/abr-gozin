import express from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { providers, sources } from "./catalog.mjs";
import { catalogDocument, catalogCSV } from "./export.mjs";
import { createStore } from "./store.mjs";
import { searchOffers, groupKey, workloadTypes } from "./pricing.mjs";
import { refreshSources } from "./ingest.mjs";
import { createSemanticEngine } from "./semantic.mjs";
const app = express(),
  store = createStore(),
  engine = createSemanticEngine(),
  port = Number(process.env.PORT || 4321);
let job = { state: "idle", done: 0, total: sources.length, finishedAt: null };
app.disable("x-powered-by");
app.use(express.json({ limit: "12kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    ["POST", "PUT", "DELETE"].includes(req.method) &&
    req.headers.origin &&
    !new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]).has(
      req.headers.origin,
    )
  )
    return res.status(403).json({ error: "مبدأ درخواست مجاز نیست" });
  const cookie = String(req.headers.cookie || "").match(
    /(?:^|;\s*)abrgozin=([a-f0-9-]{36})(?:;|$)/,
  );
  req.session = cookie?.[1] || randomUUID();
  if (!cookie)
    res.setHeader(
      "Set-Cookie",
      `abrgozin=${req.session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
    );
  next();
});
const params = z.object({
  q: z.string().max(400).default(""),
  type: z.enum(["all", "vps", "hosting"]).default("all"),
  workload: z.enum(["all", ...Object.keys(workloadTypes)]).default("all"),
  region: z.enum(["all", "ir", "eu", "unknown"]).default("all"),
  provider: z.enum(providers.map((p) => p.id)).optional(),
  cpu: z.union([z.literal("all"), z.coerce.number().min(0).max(64)]).optional(),
  ram: z
    .union([z.literal("all"), z.coerce.number().min(0).max(256)])
    .optional(),
  disk: z
    .union([z.literal("all"), z.coerce.number().min(0).max(2000)])
    .optional(),
  maxPrice: z.coerce.number().min(0).max(1000000000).optional(),
  traffic: z.coerce.number().min(0).max(10000).default(200),
  ip: z.enum(["true", "false"]).default("true"),
  sort: z.enum(["price", "providers", "ram"]).default("price"),
  saved: z.enum(["true", "false"]).optional(),
});
app.get("/api/catalog", (req, res) =>
  res.json({
    providers,
    sources,
    offers: store.offers(),
    status: store.status(),
    model: engine.status,
  }),
);
app.get("/api/export/:format", (req, res) => {
  const offers = store.offers();
  if (req.params.format === "csv")
    return res
      .type("text/csv; charset=utf-8")
      .attachment("abrgozin-hosting.csv")
      .send(catalogCSV(offers, providers));
  if (req.params.format === "json")
    return res
      .attachment("abrgozin-hosting.json")
      .json(catalogDocument(offers, providers, sources, store.status()));
  return res.status(400).json({ error: "قالب خروجی معتبر نیست" });
});
app.get("/api/search", async (req, res, next) => {
  try {
    const parsed = params.safeParse(req.query);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "فیلتر یا عبارت جست‌وجو معتبر نیست" });
    const p = {
      ...parsed.data,
      ip: parsed.data.ip === "true",
      saved:
        parsed.data.saved === "true" ? sessionChoices(req.session).saved : null,
    };
    const scores = p.q ? await engine.scores(p.q) : {};
    res.json({
      ...searchOffers(store.offers(), p, scores),
      model: engine.status,
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    model: engine.status,
    job,
    offers: store.offers().length,
  }),
);
app.get("/api/sources", (req, res) =>
  res.json({ sources, status: store.status(), job }),
);
function runRefresh() {
  job = { state: "running", done: 0, total: sources.length, finishedAt: null };
  refreshSources(store, (done, total) => {
    job.done = done;
    job.total = total;
  })
    .then(() => {
      job.state = "done";
      job.finishedAt = new Date().toISOString();
    })
    .catch(() => {
      job.state = "failed";
      job.finishedAt = new Date().toISOString();
    });
}
app.post("/api/refresh", (req, res) => {
  if (job.state === "running")
    return res.status(409).json({ error: "دریافت منابع در حال انجام است" });
  if (job.finishedAt && Date.now() - Date.parse(job.finishedAt) < 60000)
    return res
      .status(429)
      .json({ error: "برای بررسی دوباره، یک دقیقه صبر کن" });
  runRefresh();
  res.status(202).json(job);
});
function sessionChoices(session) {
  const choices = store.choices(session),
    valid = new Set(store.offers().map(groupKey));
  const current = {
    saved: choices.saved.filter((id) => valid.has(id)),
    compared: choices.compared.filter((id) => valid.has(id)),
  };
  if (JSON.stringify(current) !== JSON.stringify(choices))
    store.setChoices(session, current);
  return current;
}
app.get("/api/choices", (req, res) => res.json(sessionChoices(req.session)));
app.put("/api/choices", (req, res) => {
  const parsed = z
    .object({
      saved: z.array(z.string().max(120)).max(100),
      compared: z.array(z.string().max(120)).max(3),
    })
    .safeParse(req.body);
  const valid = new Set(store.offers().map(groupKey));
  if (
    !parsed.success ||
    [...parsed.data.saved, ...parsed.data.compared].some((x) => !valid.has(x))
  )
    return res
      .status(400)
      .json({ error: "انتخاب معتبر نیست؛ حداکثر سه گزینه را مقایسه کن" });
  const value = {
    saved: [...new Set(parsed.data.saved)],
    compared: [...new Set(parsed.data.compared)],
  };
  store.setChoices(req.session, value);
  res.json(value);
});
app.get("/api/history/:id", (req, res) =>
  res.json(store.history(req.params.id)),
);
app.get("/go/:id", (req, res) => {
  const o = store.offer(req.params.id);
  if (!o) return res.status(404).send("این پیشنهاد پیدا نشد");
  res.redirect(o.checkoutUrl);
});
app.use("/api", (req, res) => res.status(404).json({ error: "مسیر پیدا نشد" }));
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use((e, req, res, next) => {
  console.error("API:", e.message);
  res.status(e.status || 500).json({
    error:
      e.status === 413
        ? "درخواست بیش از حد بزرگ است"
        : "درخواست انجام نشد؛ دوباره تلاش کن",
  });
});
app.listen(port, "127.0.0.1", () => {
  console.log(`Abrgozin running at http://localhost:${port}`);
  if (process.env.NO_REFRESH !== "1") runRefresh();
});
setInterval(
  () => {
    if (job.state !== "running") runRefresh();
  },
  6 * 60 * 60 * 1000,
).unref();

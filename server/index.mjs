import express from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { providers, sources } from "./catalog.mjs";
import { catalogDocument, catalogCSV } from "./export.mjs";
import { createStore } from "./store.mjs";
import { searchOffers, groupKey } from "./pricing.mjs";
import { searchParams as params } from "./filters.mjs";
import { createRefreshWorker } from "./refresh-worker.mjs";
import { createSemanticEngine } from "./semantic.mjs";
import { createChatService } from "./chat.mjs";
import { workloadGuide, sizingRevision } from "./workloads.mjs";
import { outboundLink } from "../shared/outbound-link.ts";
import { runtimeConfig } from "./runtime.mjs";
const runtime = runtimeConfig();
const server = express();
const app = express.Router(),
  store = createStore(),
  engine = createSemanticEngine(),
  chat = createChatService(store),
  priceWorker = createRefreshWorker(store, {
    skipInitial: process.env.NO_REFRESH === "1",
  }),
  port = runtime.port;
server.disable("x-powered-by");
server.use((req, res, next) => {
  if (runtime.basePath && req.path === runtime.basePath)
    return res.redirect(
      308,
      runtime.basePath + "/" + req.url.slice(runtime.basePath.length),
    );
  next();
});
server.use(runtime.basePath || "/", app);
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    ["POST", "PUT", "DELETE"].includes(req.method) &&
    req.headers.origin &&
    !runtime.origins.has(req.headers.origin)
  )
    return res.status(403).json({ error: "مبدأ درخواست مجاز نیست" });
  const cookie = String(req.headers.cookie || "").match(
    /(?:^|;\s*)abrgozin=([a-f0-9-]{36})(?:;|$)/,
  );
  req.session = cookie?.[1] || randomUUID();
  if (!cookie)
    res.setHeader(
      "Set-Cookie",
      `abrgozin=${req.session}; HttpOnly; SameSite=Strict; Path=${runtime.cookiePath}; Max-Age=31536000${runtime.publicUrl ? "; Secure" : ""}`,
    );
  next();
});
app.get("/api/chat/status", (req, res) => res.json(chat.status()));
app.post("/api/chat", async (req, res) => {
  const controller = new AbortController();
  const disconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once("close", disconnected);
  try {
    const result = await chat.reply(req.body, req.session, {
      signal: controller.signal,
    });
    if (!controller.signal.aborted) res.json(result);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error.status === 429) res.setHeader("Retry-After", "60");
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "گفت‌وگو انجام نشد؛ دوباره تلاش کن.",
      code: error.code || "CHAT_ERROR",
    });
  } finally {
    res.off("close", disconnected);
  }
});
app.get("/api/catalog", (req, res) =>
  res.json({
    providers,
    sources,
    workloadGuide,
    sizingRevision,
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
    job: priceWorker.status(),
    offers: store.offers().length,
  }),
);
app.get("/api/sources", (req, res) =>
  res.json({ sources, status: store.status(), job: priceWorker.status() }),
);
app.post("/api/refresh", (req, res) => {
  if (runtime.publicUrl)
    return res
      .status(403)
      .json({ error: "بررسی دستی منابع فقط از CLI سرور انجام می‌شود." });
  try {
    void priceWorker
      .run()
      .catch(() => console.error("Price refresh did not complete"));
    res.status(202).json(priceWorker.status());
  } catch (error) {
    if (![409, 429].includes(error.status)) throw error;
    if (error.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    res.status(error.status).json({ error: error.message });
  }
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
  res.redirect(outboundLink(o.checkoutUrl, "checkout"));
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
  const dist = resolve(process.env.DIST_DIR || "dist");
  app.use(
    express.static(dist, {
      setHeaders(res, path) {
        res.setHeader(
          "Cache-Control",
          path.endsWith(".html")
            ? "no-cache"
            : path.includes("/assets/")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
        );
      },
    }),
  );
  app.get("/{*path}", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(resolve(dist, "index.html"));
  });
}
server.use((e, req, res, next) => {
  console.error("API:", e.message);
  res.status(e.status || 500).json({
    error:
      e.status === 413
        ? "درخواست بیش از حد بزرگ است"
        : "درخواست انجام نشد؛ دوباره تلاش کن",
  });
});
server.listen(port, runtime.host, () => {
  console.log(
    `Abrgozin running at http://${runtime.host}:${port}${runtime.basePath}/`,
  );
  if (process.env.REFRESH_WORKER_ENABLED !== "0") priceWorker.start();
});

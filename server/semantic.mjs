import { resolve } from "node:path";
import { norm } from "./pricing.mjs";
const descriptions = {
  vps: [
    "سرور مجازی ابری با پردازنده و رم و دیسک برای اجرای برنامه",
    "برای اجرای داکر و کانتینر به سرور لینوکس نیاز دارم",
    "اجرای پروژه پایتون و جنگو و نود جی اس و API",
    "راه اندازی بک اند برنامه موبایل و نرم افزار",
    "اجرای ربات و برنامه نویسی روی سرور با دسترسی root",
    "I need a VPS to deploy Docker Python Django Node.js backend application",
  ],
  hosting: [
    "هاست برای میزبانی وب سایت و وبلاگ با کنترل پنل",
    "یک سایت وردپرس دارم و برای آن هاست می خواهم",
    "راه اندازی فروشگاه اینترنتی ووکامرس با وردپرس",
    "می خواهم یک وبلاگ شخصی و سایت معرفی شرکت داشته باشم",
    "هاست لینوکس PHP با دایرکت ادمین یا سی پنل",
    "WordPress website hosting with cPanel for blog and WooCommerce store",
  ],
};
async function loadModel() {
  const { pipeline: make, env } = await import("@huggingface/transformers");
  env.cacheDir = process.env.MODEL_CACHE_DIR || resolve("data/models");
  env.allowLocalModels = false;
  const pipeline = await make(
    "feature-extraction",
    "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    { dtype: "q8", device: "cpu" },
  );
  return async (text) =>
    Array.from(
      (await pipeline(text, { pooling: "mean", normalize: true })).data,
    );
}
// `load` resolves to an embedding function; tests inject a fake one.
export function createSemanticEngine({
  load = loadModel,
  cacheLimit = 500,
} = {}) {
  const status = { state: "loading", name: "multilingual-MiniLM", error: null };
  let embed;
  const vectors = {};
  // LRU of normalized query → promise of scores. A hit moves to the newest
  // position; identical concurrent queries share one in-flight inference.
  const cached = new Map();
  let busy = Promise.resolve(),
    inferences = 0;
  (async () => {
    try {
      embed = await load();
      for (const [key, docs] of Object.entries(descriptions)) {
        vectors[key] = [];
        for (const doc of docs) vectors[key].push(await embed(doc));
      }
      status.state = "ready";
      console.log("Semantic search ready");
    } catch (e) {
      status.state = "failed";
      status.error =
        "جست‌وجوی مشخصات و واژه‌ها فعال است؛ مدل معنایی آماده نشد.";
      console.error("Model:", e.message);
    }
  })();
  return {
    status,
    stats: () => ({ cached: cached.size, inferences }),
    scores(query) {
      if (status.state !== "ready") return Promise.resolve({});
      const key = norm(query);
      const hit = cached.get(key);
      if (hit) {
        cached.delete(key);
        cached.set(key, hit);
        return hit;
      }
      // One inference at a time keeps CPU use bounded on the shared host.
      const job = busy.then(async () => {
        inferences++;
        const v = await embed(key),
          scores = {};
        for (const [name, values] of Object.entries(vectors))
          scores[name] = Math.max(
            ...values.map((vector) =>
              v.reduce((s, x, i) => s + x * vector[i], 0),
            ),
          );
        return scores;
      });
      busy = job.catch(() => {});
      cached.set(key, job);
      // A failed inference is retried on the next request, not cached.
      job.catch(() => {
        if (cached.get(key) === job) cached.delete(key);
      });
      if (cached.size > cacheLimit) cached.delete(cached.keys().next().value);
      return job;
    },
  };
}

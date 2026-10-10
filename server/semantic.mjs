import { resolve } from "node:path";
export function createSemanticEngine() {
  const status = { state: "loading", name: "multilingual-MiniLM", error: null };
  let pipeline,
    vectors = {};
  const cached = new Map();
  let busy = Promise.resolve();
  (async () => {
    try {
      const { pipeline: make, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.MODEL_CACHE_DIR || resolve("data/models");
      env.allowLocalModels = false;
      pipeline = await make(
        "feature-extraction",
        "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
        { dtype: "q8", device: "cpu" },
      );
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
      for (const [key, docs] of Object.entries(descriptions)) {
        vectors[key] = [];
        for (const doc of docs) {
          const x = await pipeline(doc, { pooling: "mean", normalize: true });
          vectors[key].push(Array.from(x.data));
        }
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
    async scores(query) {
      if (status.state !== "ready") return {};
      if (cached.has(query)) return cached.get(query);
      const job = busy.then(async () => {
        const x = await pipeline(query, { pooling: "mean", normalize: true }),
          v = Array.from(x.data),
          scores = {};
        for (const [key, values] of Object.entries(vectors))
          scores[key] = Math.max(
            ...values.map((vector) =>
              v.reduce((s, x, i) => s + x * vector[i], 0),
            ),
          );
        cached.set(query, scores);
        if (cached.size > 100) cached.delete(cached.keys().next().value);
        return scores;
      });
      busy = job.catch(() => {});
      return job;
    },
  };
}

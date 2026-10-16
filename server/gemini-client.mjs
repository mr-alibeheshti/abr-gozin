import { fetch, ProxyAgent } from "undici";
import { setTimeout as delay } from "node:timers/promises";
import { geminiRoute } from "./gemini-route.mjs";

const failure = (status, code, message) =>
  Object.assign(new Error(message), { status, code });
const bounded = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Number(value) || fallback));
const transient = new Set([408, 500, 502, 503, 504]);

export function createGeminiClient(env) {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const route = geminiRoute(env);
  const gateway = route.transport === "cloudflare-ai-gateway";
  const base = route.base;
  const timeoutMs = bounded(env.GEMINI_TIMEOUT_MS, 20000, 100, 60000);
  const attemptMs = bounded(
    env.GEMINI_ATTEMPT_TIMEOUT_MS,
    gateway ? timeoutMs : 10000,
    100,
    timeoutMs,
  );
  // Gateway traffic must not depend on the failing local proxy tunnel.
  const dispatcher =
    !gateway && env.GEMINI_PROXY_URL
      ? new ProxyAgent(env.GEMINI_PROXY_URL)
      : undefined;
  return {
    configured: Boolean(key) && !route.configurationError,
    configurationError: route.configurationError,
    transport: route.transport,
    model,
    timeoutMs,
    async generate(body, { signal, onAttempt = () => {} } = {}) {
      if (route.configurationError)
        throw failure(503, "AI_NOT_CONFIGURED", route.configurationError);
      let requestUrl = `${base.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      if (gateway) {
        // The live gateway rejects header-only Google auth (2044). Keep the
        // query credential server-side; never log this URL or upstream bodies.
        const url = new URL(requestUrl);
        url.searchParams.set("key", key);
        requestUrl = url.href;
      }
      const deadline = AbortSignal.timeout(timeoutMs);
      const sharedSignal = signal
        ? AbortSignal.any([signal, deadline])
        : deadline;
      const started = Date.now();
      for (let attempt = 0; attempt < 2; attempt++) {
        let response;
        try {
          sharedSignal.throwIfAborted();
          onAttempt();
          response = await fetch(requestUrl, {
            method: "POST",
            redirect: "error",
            dispatcher,
            headers: {
              "Content-Type": "application/json",
              ...(!gateway ? { "x-goog-api-key": key } : {}),
              ...route.headers,
              ...(gateway
                ? {
                    "cf-aig-request-timeout": String(
                      Math.max(
                        1,
                        Math.min(attemptMs, timeoutMs - (Date.now() - started)),
                      ),
                    ),
                  }
                : {}),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.any([
              sharedSignal,
              AbortSignal.timeout(attemptMs),
            ]),
          });
          if (response.ok) {
            // Parsing shares the same deadline, including slow response bodies.
            return await response.json();
          }
          console.warn("[Gemini] upstream HTTP", response.status);
          const retryAfter = response.headers.get("retry-after");
          // Never read/log error bodies: proxies may echo credentials or messages.
          await response.body?.cancel();
          const error =
            response.status === 429
              ? failure(
                  429,
                  "AI_QUOTA_EXCEEDED",
                  "سهمیهٔ سرویس هوش مصنوعی فعلاً تمام شده است؛ بعداً دوباره تلاش کن.",
                )
              : [401, 403].includes(response.status)
                ? failure(
                    502,
                    "AI_AUTH_ERROR",
                    gateway
                      ? "دسترسی پذیرفته نشد؛ توکن درگاه Cloudflare و کلید Gemini باید بررسی شوند."
                      : "سرویس هوش مصنوعی دسترسی را نپذیرفت؛ کلید و دسترسی پروژه باید بررسی شود.",
                  )
                : failure(
                    502,
                    "AI_UPSTREAM_ERROR",
                    "سرویس هوش مصنوعی فعلاً پاسخ نمی‌دهد؛ دوباره تلاش کن.",
                  );
          error.retryable = transient.has(response.status);
          if (retryAfter) {
            const seconds = Number(retryAfter);
            error.retryAfterMs = Number.isFinite(seconds)
              ? Math.max(0, seconds * 1000)
              : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
          }
          throw error;
        } catch (error) {
          if (signal?.aborted)
            throw failure(499, "CHAT_CANCELLED", "دریافت پاسخ متوقف شد.");
          const timedOut =
            deadline.aborted ||
            error.name === "TimeoutError" ||
            error.name === "AbortError";
          const networkFailure = !response && !error.status;
          const retryable = error.retryable || timedOut || networkFailure;
          const pause = Math.max(
            400 + Math.floor(Math.random() * 250),
            error.retryAfterMs || 0,
          );
          const remaining = timeoutMs - (Date.now() - started);
          if (
            attempt === 0 &&
            retryable &&
            !deadline.aborted &&
            remaining > pause + 100
          ) {
            try {
              await delay(pause, undefined, { signal: sharedSignal });
              continue;
            } catch {
              if (signal?.aborted)
                throw failure(499, "CHAT_CANCELLED", "دریافت پاسخ متوقف شد.");
            }
          }
          if (timedOut || deadline.aborted)
            throw failure(
              504,
              "AI_TIMEOUT",
              "پاسخ سرویس هوش مصنوعی طول کشید. پیام تو حفظ شده؛ دوباره تلاش کن.",
            );
          if (error.status && error.code) throw error;
          if (response)
            throw failure(
              502,
              "AI_INVALID_RESPONSE",
              "پاسخ قابل اعتماد از هوش مصنوعی دریافت نشد؛ دوباره تلاش کن.",
            );
          throw failure(
            502,
            "AI_UPSTREAM_ERROR",
            "ارتباط با هوش مصنوعی برقرار نشد؛ دوباره تلاش کن.",
          );
        }
      }
    },
  };
}

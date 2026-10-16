// https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/
export function geminiRoute(env) {
  const gateway = env.GEMINI_GATEWAY_URL?.trim();
  const token = env.GEMINI_GATEWAY_TOKEN?.trim();
  if (!gateway && !token)
    return {
      base: env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com",
      transport: env.GEMINI_PROXY_URL ? "http-proxy" : "direct",
      headers: {},
    };
  const invalid = () => ({
    transport: "cloudflare-ai-gateway",
    headers: {},
    configurationError:
      "آدرس درگاه Cloudflare و توکن آن را در تنظیمات سرور کامل و معتبر وارد کن.",
  });
  if (!gateway || !token || /[\r\n]/.test(token)) return invalid();
  let url;
  try {
    url = new URL(gateway);
  } catch {
    return invalid();
  }
  const cloudflare =
    url.protocol === "https:" &&
    url.hostname === "gateway.ai.cloudflare.com" &&
    !url.port &&
    /^\/v1\/[a-f0-9]{32}\/[a-zA-Z0-9_-]{1,64}\/google-ai-studio\/?$/.test(
      url.pathname,
    );
  // Local HTTP contract simulations exercise the real transport with fake keys.
  const localSimulation =
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (!cloudflare && !localSimulation) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return invalid();
  return {
    base: url.href.replace(/\/$/, ""),
    transport: "cloudflare-ai-gateway",
    headers: {
      "cf-aig-authorization": `Bearer ${token}`,
      "cf-aig-skip-cache": "true",
      "cf-aig-collect-log": "false",
      "cf-aig-max-attempts": "1",
      "cf-aig-no-wholesale": "true",
    },
  };
}

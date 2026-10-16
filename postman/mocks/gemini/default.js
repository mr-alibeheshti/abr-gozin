// Local contract simulation only. Based on Google's documented generateContent
// REST request/response; no provider workspace was connected or published.
const http = require("http");
const geminiAttempts = new Map();
http
  .createServer(async (req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, "http://simulation.local");
    if (
      url.pathname !== "/v1beta/models/gemini-3.5-flash-lite:generateContent" ||
      req.method !== "POST"
    )
      return json(501, { error: { message: "Endpoint not modeled" } });
    let body = req.body;
    if (!body) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { error: { message: "Invalid JSON" } });
      }
    }
    const gateway = Boolean(req.headers["cf-aig-authorization"]);
    const apiKey = gateway
      ? url.searchParams.get("key")
      : req.headers["x-goog-api-key"];
    if (
      apiKey !== "simulation-only-key" ||
      (gateway && req.headers["x-goog-api-key"]) ||
      (!gateway && url.searchParams.has("key"))
    )
      return json(403, { error: { message: "Invalid API key" } });
    if (
      req.headers["cf-aig-authorization"] &&
      req.headers["cf-aig-authorization"] !== "Bearer simulation-gateway-token"
    )
      return json(403, { error: { message: "Invalid gateway token" } });
    if (
      !body.systemInstruction?.parts?.[0]?.text?.includes("PUBLIC_CATALOG=") ||
      !body.generationConfig?.responseJsonSchema ||
      !Array.isArray(body.contents) ||
      body.contents.at(-1)?.role !== "user"
    )
      return json(400, {
        error: { message: "Request does not match Gemini contract" },
      });
    const text = body.contents.at(-1).parts[0].text;
    const tries = (geminiAttempts.get(text) || 0) + 1;
    geminiAttempts.set(text, tries);
    if (
      text === "__always_busy__" ||
      (text === "__retry_once__" && tries === 1)
    )
      return json(503, { error: { status: "UNAVAILABLE" } });
    if (text === "__retry_after__") {
      res.setHeader("Retry-After", "60");
      return json(503, { error: { status: "UNAVAILABLE" } });
    }
    if (text === "__attempt_timeout__" && tries === 1)
      await new Promise((resolve) => setTimeout(resolve, 300));
    if (text === "__slow_body__") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"candidates":');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return res.end("[]}");
    }
    if (text === "__quota__")
      return json(429, {
        error: { status: "RESOURCE_EXHAUSTED", message: "Quota exhausted" },
      });
    if (text === "__html__") {
      res.writeHead(500, { "Content-Type": "text/html" });
      return res.end("<h1>Gateway failure</h1>");
    }
    if (text === "__slow__")
      await new Promise((resolve) => setTimeout(resolve, 700));
    const instruction = body.systemInstruction.parts[0].text;
    const currentNeeds = JSON.parse(
      instruction.split("CURRENT_NEEDS=")[1].split("\n")[0],
    );
    const currentFilters = JSON.parse(
      instruction.split("CURRENT_FILTERS=")[1].split("\n")[0],
    );
    const catalog = JSON.parse(
      instruction.split("PUBLIC_CATALOG=")[1].split("\n")[0],
    );
    if (catalog.rows.length > 12)
      return json(400, { error: { message: "Unbounded catalog prompt" } });
    let needs = {
      purpose: null,
      quantity: null,
      storage: null,
      load: null,
      features: null,
    };
    let intent = "consultation";
    const complete = () => {
      needs = {
        purpose: "پروژهٔ تازه",
        quantity: "۲۰۰ مورد",
        storage: "نامشخص",
        load: "نامشخص",
        features: "نیاز خاصی ندارم",
      };
    };
    const filters = {
      type: "hosting",
      workload: "all",
      scenario: "general",
      region: "all",
      provider: [],
      ram: null,
      cpu: null,
      disk: null,
      maxPrice: null,
      sort: "price",
      traffic: 200,
      ip: true,
    };
    let reply =
        "هاست را برای چه کاری می‌خواهی؛ وردپرس یا سایت دیگری؟ حدود بازدید و منابع مورد نیازت چقدر است؟",
      offerIds = [];
    if (text.includes("وردپرس")) {
      filters.workload = "wordpress";
      filters.maxPrice = 5000000;
      offerIds = ["liara-wordpress-1-2-20"];
      reply =
        "برای سایت وردپرسی با این بودجه، این پلن موجود در کاتالوگ را بررسی کن. موقعیت و فضای مورد نیازت را هم بگو.";
    }
    if (text === "__vps__" || text === "__mismatch__") {
      Object.assign(filters, {
        type: "vps",
        provider: ["liara"],
        workload: "backend",
        scenario: "node",
        maxPrice: 10000000,
        ram: 4,
        cpu: 2,
        disk: 40,
      });
      complete();
      reply = "این سرور برای هر تعداد کاربر کافی و تضمینی است.";
      offerIds = [
        text === "__mismatch__" ? "arvan-1-1-20" : "liara-vps-2-4-40",
      ];
    }
    if (text === "__unknown__") offerIds = ["invented-offer"];
    if (
      ["__complete__", "__tiny__", "__gpu__"].includes(text) ||
      text.includes("__complete__") ||
      text.includes("۵۰۰ تومن")
    ) {
      Object.assign(filters, {
        workload: "wordpress",
        scenario: "store",
        maxPrice: 5000000,
      });
      complete();
      reply = "این سرور برای هر تعداد کاربر کافی و تضمینی است.";
      offerIds = [
        text === "__tiny__" ? "hostnegar-P1" : "liara-wordpress-1-2-20",
      ];
      if (text === "__gpu__")
        Object.assign(filters, {
          type: "vps",
          workload: "python",
          scenario: "ml",
          gpu: true,
        });
    }
    if (text.startsWith("__needs_")) {
      const workload = text.slice(8, -2);
      Object.assign(filters, {
        workload,
        type: ["wordpress", "website"].includes(workload) ? "hosting" : "vps",
        maxPrice: 5000000,
      });
      // Deliberately premature catalog offer: server must gate it.
      offerIds = ["liara-wordpress-1-2-20"];
    }
    if (text === "__persist__") {
      Object.assign(filters, currentFilters);
      needs = currentNeeds;
      offerIds = ["liara-wordpress-1-2-20"];
    }
    if (text === "__smalltalk__") {
      intent = "smalltalk";
      reply = "سلام! من دستیار انتخاب سرویس هستم.";
    }
    if (text === "__context__") {
      intent = "explanation";
      reply = JSON.stringify({
        rows: catalog.rows.length,
        totalOffers: catalog.totalOffers,
        promptBytes: Buffer.byteLength(instruction),
        thinking: body.generationConfig.thinkingConfig,
        guide: JSON.parse(
          instruction.split("WORKLOAD_GUIDE=")[1].split("\n")[0],
        ),
      });
    }
    if (text === "__gateway_context__") {
      intent = "explanation";
      reply = JSON.stringify({
        providerAuth: url.searchParams.has("key") ? "query" : "header",
        authenticated:
          req.headers["cf-aig-authorization"] ===
          "Bearer simulation-gateway-token",
        skipCache: req.headers["cf-aig-skip-cache"],
        collectLog: req.headers["cf-aig-collect-log"],
        maxAttempts: req.headers["cf-aig-max-attempts"],
        noWholesale: req.headers["cf-aig-no-wholesale"],
        timeoutMs: Number(req.headers["cf-aig-request-timeout"]),
      });
    }
    if (["__retry_once__", "__attempt_timeout__"].includes(text)) {
      intent = "explanation";
      reply = "Recovered after " + tries + " attempts";
    }
    if (text === "__server_select__") {
      Object.assign(filters, {
        workload: "wordpress",
        scenario: "store",
        maxPrice: 5000000,
      });
      complete();
      offerIds = [];
    }
    const answer = { reply, filters, offerIds, needs, intent };
    if (text === "__invalid__") answer.filters.provider = ["invented-provider"];
    const content =
      text === "__broken_json__" ? "not JSON" : JSON.stringify(answer);
    json(200, {
      candidates: [
        {
          content: { role: "model", parts: [{ text: content }] },
          finishReason: "STOP",
        },
      ],
    });
  })
  .listen(process.env.PORT);

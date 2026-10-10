import { providers } from "./catalog.mjs";
export const digits = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
export const number = (s) => {
  const match = digits(s)
    .replace(/[٫]/g, ".")
    .replace(/[,٬،\s]/g, "")
    .match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
export const norm = (s) =>
  digits(s)
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function parseQuery(query) {
  const q = norm(query),
    fields = {},
    reasons = [];
  for (const [field, re] of [
    [
      "ram",
      /(\d+(?:\.\d+)?)\s*(?:گیگ(?:ابایت)?\s*)?(?:رم|ram)|(?:رم|ram)\s*(\d+(?:\.\d+)?)/i,
    ],
    ["cpu", /(\d+)\s*(?:هسته|cpu|vcpu)|(?:cpu|vcpu)\s*(\d+)/i],
    [
      "disk",
      /(\d+(?:\.\d+)?)\s*(?:گیگ(?:ابایت)?\s*)?(?:فضا|دیسک|ssd)|(?:فضا|دیسک|ssd)\s*(\d+(?:\.\d+)?)/i,
    ],
  ]) {
    const m = q.match(re);
    if (m) {
      fields[field] = Number(m[1] || m[2]);
      reasons.push(field);
    }
  }
  if (/ایران|داخلی/.test(q)) fields.region = "ir";
  else if (/اروپا|خارج|آلمان/.test(q)) fields.region = "eu";
  if (
    /داکر|docker|جنگو|django|پایتون|python|node\.js|نود|بک اند|backend/.test(q)
  )
    fields.type = "vps";
  else if (/وردپرس|wordpress/.test(q)) fields.type = "hosting";
  else if (/هاست|hosting/.test(q)) fields.type = "hosting";
  else if (/سرور|vps/.test(q)) fields.type = "vps";
  const compact = (s) => norm(s).replace(/[\s.\-_]/g, "");
  const compactQuery = compact(q);
  const matches = providers.filter((p) =>
    [p.name, p.en, p.id, ...(p.aliases || [])].some((alias) =>
      compactQuery.includes(compact(alias)),
    ),
  );
  if (matches.length)
    fields.provider = matches.sort(
      (a, b) => b.name.length - a.name.length,
    )[0].id;
  const b = q.match(
    /(?:زیر|حداکثر|بودجه|تا)\s*(\d+(?:\.\d+)?)\s*(میلیون|هزار)?/,
  );
  if (b)
    fields.maxPrice =
      Number(b[1]) * (b[2] === "میلیون" ? 1e6 : b[2] === "هزار" ? 1e3 : 1);
  return { fields, reasons };
}
export function estimate(o, { traffic = 200, ip = true } = {}) {
  const parts = [
      {
        label: o.custom ? "منابع پردازشی و دیسک" : "تعرفهٔ پایهٔ ماهانه",
        amount: o.price,
      },
    ],
    warnings = [];
  if (ip && o.type === "vps") {
    if (o.ipMonthly !== null)
      parts.push({ label: "یک نشانی IPv4", amount: o.ipMonthly });
    else warnings.push("هزینهٔ جداگانهٔ IP در منبع مشخص نشده است.");
  }
  let extra = 0;
  if (o.type === "vps" && traffic > 0) {
    if (o.trafficGB !== null) {
      extra = Math.max(0, traffic - o.trafficGB);
      if (extra && o.trafficRate === null)
        warnings.push("مبلغ ترافیک بیشتر از سهمیه مشخص نیست.");
      else
        parts.push({
          label: `ترافیک بیشتر از سهمیه (${extra} GB)`,
          amount: extra * (o.trafficRate || 0),
        });
    } else if (!o.trafficUnlimited)
      warnings.push("تعرفهٔ ترافیک در منبع مشخص نشده است.");
  }
  if (
    o.type !== "vps" &&
    traffic > 0 &&
    o.trafficGB !== null &&
    traffic > o.trafficGB
  )
    warnings.push(
      "مصرف انتخاب‌شده بیشتر از سهمیهٔ هاست است؛ تعرفهٔ اضافه مشخص نیست.",
    );
  const subtotal = parts.reduce((s, p) => s + p.amount, 0);
  if (o.vatRate !== null)
    parts.push({
      label: `مالیات ذکرشده در منبع (${o.vatRate * 100}٪)`,
      amount: subtotal * o.vatRate,
    });
  else warnings.push("مالیات در این منبع مشخص نشده و در برآورد نیامده است.");
  const total = Math.round(parts.reduce((s, p) => s + p.amount, 0));
  const roundedParts = parts.map((x) => ({
    ...x,
    amount: Math.round(x.amount),
  }));
  roundedParts[roundedParts.length - 1].amount +=
    total - roundedParts.reduce((sum, part) => sum + part.amount, 0);
  return {
    total,
    parts: roundedParts,
    warnings,
    trafficExtra: extra,
    upfront: Math.round(
      (o.upfront || o.price * o.period) * (1 + (o.vatRate || 0)),
    ),
  };
}
export const groupKey = (o) =>
  `${o.type}-${o.region}-${o.cpu ?? "shared"}-${o.ram ?? "shared"}-${o.disk}`;
// Workloads narrow the infrastructure category; they do not invent capacity
// requirements or claim that a provider manages the selected software.
export const workloadTypes = {
  docker: "vps",
  backend: "vps",
  python: "vps",
  database: "vps",
  wordpress: "hosting",
  website: "hosting",
};
export function searchOffers(offers, p, semantic = {}) {
  const intent = parseQuery(p.q || ""),
    filters = { ...p };
  for (const [k, v] of Object.entries(intent.fields))
    if (
      filters[k] === undefined ||
      filters[k] === "" ||
      (filters[k] === "all" && !["cpu", "ram", "disk"].includes(k))
    )
      filters[k] = v;
  const resourceFilters = Object.fromEntries(
    ["cpu", "ram", "disk"]
      .filter((k) => Number(filters[k]) > 0)
      .map((k) => [k, Number(filters[k])]),
  );
  let items = offers.filter(
    (o) =>
      (!filters.type ||
        filters.type === "all" ||
        (filters.type === "hosting" ? o.type !== "vps" : o.type === "vps")) &&
      (!workloadTypes[filters.workload] ||
        (workloadTypes[filters.workload] === "vps"
          ? o.type === "vps"
          : o.type !== "vps")) &&
      (!filters.region ||
        filters.region === "all" ||
        o.region === filters.region) &&
      (!filters.provider || o.providerId === filters.provider) &&
      (!p.saved || p.saved.includes(groupKey(o))),
  );
  const tokens = norm(p.q || "")
    .split(" ")
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          "برای",
          "خوام",
          "خواهم",
          "سرور",
          "گیگابایت",
          "گیگ",
          "هسته",
          "ارزان",
          "ارزون",
          "مناسب",
          "می",
        ].includes(w),
    );
  const hasIntent = Object.keys(intent.fields).length > 0;
  items = items.map((o) => ({
    ...o,
    estimate: estimate(o, { traffic: p.traffic, ip: p.ip }),
    semantic: semantic[o.type] || 0,
  }));
  if (filters.maxPrice !== undefined)
    items = items.filter((o) => o.estimate.total <= filters.maxPrice);
  if (p.q && !hasIntent && tokens.length) {
    const matched = items.filter((o) =>
      tokens.some((t) =>
        norm(
          [
            o.name,
            o.providerId,
            o.type === "vps"
              ? "سرور مجازی ابری لینوکس"
              : "هاست میزبانی وردپرس وب سایت",
            ...o.notes,
          ].join(" "),
        ).includes(t),
      ),
    );
    if (matched.length) items = matched;
    else if (Object.values(semantic).some((x) => x > 0.4)) {
      const best = Object.entries(semantic).sort((a, b) => b[1] - a[1])[0]?.[0];
      items = items.filter((o) =>
        best === "vps" ? o.type === "vps" : o.type !== "vps",
      );
    } else items = [];
  }
  const grouped = new Map();
  for (const o of items) {
    const key = groupKey(o);
    if (!grouped.has(key))
      grouped.set(key, {
        id: key,
        type: o.type === "vps" ? "vps" : "hosting",
        serviceType: o.type,
        region: o.region,
        cpu: o.cpu,
        ram: o.ram,
        disk: o.disk,
        offers: [],
      });
    grouped.get(key).offers.push(o);
  }
  const candidates = [...grouped.values()].map((g) => {
    g.offers.sort((a, b) => a.estimate.total - b.estimate.total);
    return {
      ...g,
      min: g.offers[0].estimate.total,
      max: g.offers.at(-1).estimate.total,
      providerCount: new Set(g.offers.map((x) => x.providerId)).size,
    };
  });
  const sortGroups = (a, b) =>
    p.sort === "providers"
      ? b.providerCount - a.providerCount || a.min - b.min
      : p.sort === "ram"
        ? (b.ram || 0) - (a.ram || 0)
        : a.min - b.min;
  const groups = [],
    similar = [];
  for (const g of candidates) {
    // Unknown resources cannot establish either equality or closeness.
    if (Object.keys(resourceFilters).some((k) => g[k] === null || g[k] <= 0))
      continue;
    const differences = Object.entries(resourceFilters)
      .filter(([field, requested]) => g[field] !== requested)
      .map(([field, requested]) => ({ field, requested, actual: g[field] }));
    if (!differences.length) groups.push({ ...g, differences: [] });
    else if (
      differences.every(
        (d) => d.actual >= d.requested / 2 && d.actual <= d.requested * 2,
      )
    ) {
      const distance = differences.reduce(
        (sum, d) => sum + Math.abs(Math.log2(d.actual / d.requested)),
        0,
      );
      similar.push({ ...g, differences, distance });
    }
  }
  groups.sort(sortGroups);
  similar.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.differences.length - b.differences.length ||
      sortGroups(a, b),
  );
  const similarGroups = similar.slice(0, 9).map(({ distance, ...g }) => g);
  return {
    groups,
    similarGroups,
    totalOffers: groups.reduce((n, g) => n + g.offers.length, 0),
    similarTotalOffers: similarGroups.reduce((n, g) => n + g.offers.length, 0),
    similarTotalGroups: similar.length,
    resourceFilters,
    intent,
    filters,
  };
}

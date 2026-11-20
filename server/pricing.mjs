import { providers } from "./catalog.mjs";
import {
  workloadTypes,
  requirementsFor,
  meetsRequirements,
} from "./workloads.mjs";
import { paretoOrder } from "./pareto.mjs";
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
    .replace(/[‌-‏]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const serviceCategory = (type) =>
  type === "dedicated" ? "dedicated" : type === "vps" ? "vps" : "hosting";
// Service-intent classifier constants; calibrated in eval/intent-sweep.json.
export const INTENT_THRESHOLD = 0.4;
export const INTENT_MARGIN = 0.03;

// Persian letters are not \w, so word edges are expressed with Unicode classes.
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";
const re = (source) => new RegExp(source, "u");

// ---------------------------------------------------------------------------
// Persian number words → digits (F5). Only runs that read as amounts are
// rewritten: a run must contain a scale word, be followed by a unit, or follow
// a budget word. This keeps «نه» (no) and «سی پنل» (cPanel) untouched.
const NUMBER_WORDS = new Map(
  Object.entries({
    یک: 1,
    دو: 2,
    سه: 3,
    چهار: 4,
    پنج: 5,
    شش: 6,
    شیش: 6,
    هفت: 7,
    هشت: 8,
    نه: 9,
    ده: 10,
    یازده: 11,
    دوازده: 12,
    سیزده: 13,
    چهارده: 14,
    پانزده: 15,
    پونزده: 15,
    شانزده: 16,
    شونزده: 16,
    هفده: 17,
    هیفده: 17,
    هجده: 18,
    هیجده: 18,
    نوزده: 19,
    بیست: 20,
    سی: 30,
    چهل: 40,
    پنجاه: 50,
    شصت: 60,
    هفتاد: 70,
    هشتاد: 80,
    نود: 90,
    صد: 100,
    یکصد: 100,
    دویست: 200,
    سیصد: 300,
    چهارصد: 400,
    پانصد: 500,
    پونصد: 500,
    ششصد: 600,
    شیشصد: 600,
    هفتصد: 700,
    هشتصد: 800,
    نهصد: 900,
  }),
);
const SCALE_WORDS = new Map([
  ["هزار", 1e3],
  ["میلیون", 1e6],
  ["ملیون", 1e6],
]);
const HALF = "نیم";
const UNIT_AFTER =
  /^(?:تومان|تومن|ریال|گیگ|گیگابایت|گیگابایتی|گیگی|gb|g|رم|ram|هسته|هسته‌ای|core|cores|cpu|cpus|vcpu|ترابایت|ترا|tb|دیسک|فضا|ssd|nvme|hdd|مگ|مگابایت|mb)[،,.؟?!]?$/;
const AMOUNT_BEFORE =
  /^(?:زیر|حداکثر|تا|بودجه|ماهانه|ماهیانه|ماهی|کمتر|نهایتا[ًٌٍ]?|سقف|حدود)$/;
const isDigitToken = (t) => /^\d+(?:\.\d+)?$/.test(t);
const isWordNumber = (t) => NUMBER_WORDS.has(t) || t === HALF;
const isAmountToken = (t) => isWordNumber(t) || isDigitToken(t);
// After a scale word, a following number belongs to the same amount only when
// it ends in a smaller scale («دو میلیون و پانصد هزار»), not «… و ۲ گیگ».
function smallerScaleFollows(tokens, from, scale) {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (SCALE_WORDS.has(t)) return SCALE_WORDS.get(t) < scale;
    if (!(isAmountToken(t) || t === "و")) return false;
  }
  return false;
}
function amountValue(run) {
  let total = 0,
    current = 0,
    lastScale = 0,
    maxScale = 0;
  for (const t of run) {
    if (t === "و") continue;
    if (SCALE_WORDS.has(t)) {
      const scale = SCALE_WORDS.get(t);
      total += (current || 1) * scale;
      current = 0;
      lastScale = scale;
      maxScale = Math.max(maxScale, scale);
    } else if (t === HALF) {
      if (current === 0 && lastScale) total += lastScale / 2;
      else current += 0.5;
    } else if (t === "صد" && current > 0 && current < 10) current *= 100;
    else current += NUMBER_WORDS.has(t) ? NUMBER_WORDS.get(t) : Number(t);
  }
  total += current;
  return maxScale
    ? `${+(total / maxScale).toFixed(6)} ${maxScale === 1e6 ? "میلیون" : "هزار"}`
    : String(+total.toFixed(6));
}
export function convertNumberWords(text) {
  const tokens = String(text).split(" ");
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isAmountToken(tokens[i])) {
      out.push(tokens[i++]);
      continue;
    }
    const run = [tokens[i++]];
    while (i < tokens.length) {
      const t = tokens[i],
        prev = run[run.length - 1];
      const prevScale = SCALE_WORDS.get(prev);
      if (SCALE_WORDS.has(t) && !prevScale) {
        run.push(t);
        i++;
      } else if (t === "و" && i + 1 < tokens.length) {
        const next = tokens[i + 1];
        const joins = prevScale
          ? next === HALF ||
            (isAmountToken(next) &&
              smallerScaleFollows(tokens, i + 1, prevScale))
          : (isWordNumber(next) && (isWordNumber(prev) || next === HALF)) ||
            (isDigitToken(prev) && next === HALF);
        if (!joins) break;
        run.push(t, next);
        i += 2;
      } else if (
        prevScale &&
        isAmountToken(t) &&
        smallerScaleFollows(tokens, i, prevScale)
      ) {
        run.push(t);
        i++;
      } else if (
        t === "صد" &&
        NUMBER_WORDS.get(prev) > 0 &&
        NUMBER_WORDS.get(prev) < 10
      ) {
        run.push(t);
        i++;
      } else break;
    }
    const scaled = run.some((t) => SCALE_WORDS.has(t));
    const compound =
      run.includes("و") || run.filter((t) => SCALE_WORDS.has(t)).length > 1;
    const context =
      scaled ||
      (i < tokens.length && UNIT_AFTER.test(tokens[i])) ||
      (out.length > 0 && AMOUNT_BEFORE.test(out[out.length - 1]));
    if ((run.some(isWordNumber) || compound) && context)
      out.push(amountValue(run));
    else out.push(...run);
  }
  return out.join(" ");
}

// ---------------------------------------------------------------------------
// Budgets (F3/F4). Units: ریال ÷10; تومان/تومن ×1; هزار/K ×1e3; میلیون/M ×1e6.
const BUDGET = re(
  `${L}(?:زیر|حداکثر|بودجه(?:\\s*(?:ماهانه|ماهیانه|ماهی))?|تا|کمتر\\s*از|کم\\s*تر\\s*از|نهایتا[ًٌٍ]?|ماهی|ماهانه|ماهیانه|سقف(?:\\s*(?:بودجه|قیمت))?|under|below|max(?:imum)?|less\\s+than|up\\s+to|budget)\\s*(\\d[\\d,٬]*(?:[.٫]\\d+)?)\\s*(?:(هزار|میلیون|ملیون|k|m|mil|million|thousand)${R})?\\s*(?:(تومان|تومن|ریال|toman|tomans|rial|rials|irr|irt)${R})?`,
);
// A bare number followed by a resource or duration is not a price («تا ۴ گیگ رم»).
const NOT_A_PRICE = re(
  `^\\s*(?:گیگ|gb|g${R}|رم|ram|هسته|cpu|vcpu|core|دیسک|فضا|ترا|tb|مگ|mb|تا${R}|ماه|روز|سال|هفته|نفر|کاربر|سایت|دامنه|ایمیل|اکانت|عدد)`,
);
const SMALL_UNIT_LIMIT = 10000;
export function readBudget(text) {
  const m = BUDGET.exec(text);
  if (!m) return null;
  const [phrase, raw, scaleWord, currency] = m;
  if (
    !scaleWord &&
    !currency &&
    NOT_A_PRICE.test(text.slice(m.index + phrase.length))
  )
    return null;
  const n = number(raw);
  if (n === null) return null;
  const scale = !scaleWord
    ? 1
    : /^(?:هزار|k|thousand)$/.test(scaleWord)
      ? 1e3
      : 1e6;
  const rial = /^(?:ریال|rial|rials|irr)$/.test(currency || "");
  const scaleName =
    scale === 1e6 ? "million-" : scale === 1e3 ? "thousand-" : "";
  const base = { phrase: phrase.trim(), amount: n };
  if (scaleWord || rial)
    return {
      ...base,
      value: Math.round((n * scale) / (rial ? 10 : 1)),
      unit: scaleName + (rial ? "rial" : "toman"),
      assumed: false,
    };
  if (currency && n >= 1000)
    return { ...base, value: n, unit: "toman", assumed: false };
  if (!currency && n >= SMALL_UNIT_LIMIT)
    return { ...base, value: n, unit: "toman", assumed: true };
  // «زیر ۵۰۰» or colloquial «۲۰۰ تومن»: thousands or millions. searchOffers
  // picks the candidate inside the live catalog's price range for the type;
  // this default (×1e3 from 20 up, else ×1e6) applies when neither fits.
  const thousand = n * 1e3,
    million = n * 1e6;
  return {
    ...base,
    candidates: [thousand, million],
    value: n >= 20 ? thousand : million,
    unit: n >= 20 ? "thousand-toman" : "million-toman",
    assumed: true,
  };
}

// ---------------------------------------------------------------------------
// Provider names are entities, not intent words: «ایران‌سرور» or «ایران هاست»
// must not set a region or service type by themselves (F1).
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compact = (s) => norm(s).replace(/[\s.\-_]/g, "");
const providerMatchers = providers.map((p) => ({
  id: p.id,
  length: p.name.length,
  patterns: [
    ...new Set(
      [p.name, p.en, p.id, ...(p.aliases || [])].map(compact).filter(Boolean),
    ),
  ].map(
    (alias) =>
      new RegExp(
        `${L}${[...alias].map(escapeRe).join("[\\s.\\-_]*")}${R}`,
        "gu",
      ),
  ),
}));
const FOREIGN = re(
  [
    "خارج\\s*(?:از\\s*)?(?:ایران|کشور)",
    "بیرون\\s*(?:از\\s*)?(?:ایران|کشور)",
    "غیر\\s*ایران(?:ی)?",
    "(?:به\\s*)?جز\\s*ایران",
    `${L}خارج(?:ی)?${R}`,
    `${L}(?:اروپا|آلمان|المان|هلند|فنلاند|فرانسه|انگلیس|انگلستان)(?:یی|ی)?${R}`,
    `${L}(?:outside(?:\\s+of)?\\s+iran|non[\\s-]?iran(?:ian)?|abroad|foreign|overseas|europe(?:an)?|eu|germany|netherlands|holland|finland|france)${R}`,
  ].join("|"),
);
const IRAN = re(
  `${L}(?:ایران(?:ی)?|داخلی|داخل\\s*(?:ایران|کشور)|iran(?:ian)?)${R}`,
);
const VPS_WORKLOAD =
  /داکر|docker|جنگو|django|پایتون|python|node\.js|نود|بک اند|backend/;
const WORDPRESS = /وردپرس|wordpress|ووکامرس|woocommerce/;
const HOSTING = re(`هاست|hosting|${L}host${R}`);
const VPS = re(`سرور|vps|vds|مجازی|${L}server${R}`);
// Website purposes (F6) select the matching WordPress scenario floors.
const STORE = re(
  `فروشگاه|ووکامرس|woocommerce|${L}(?:shop|store|e-?commerce|eshop)${R}`,
);
const BLOG = re(
  `وبلاگ|${L}بلاگ|سایت\\s*(?:خبری|محتوایی)|${L}(?:blog|news\\s+(?:site|website))${R}`,
);
const BUSINESS = re(
  `سایت\\s*شرکت(?:ی)?|${L}(?:corporate|company|business)\\s+(?:site|website)${R}`,
);
const BARE_SIZE = new RegExp(
  `(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s*(?:گیگابایت|گیگ|gb)${R}`,
  "gu",
);
const sitePurpose = (q) =>
  STORE.test(q)
    ? "store"
    : BLOG.test(q)
      ? "blog"
      : BUSINESS.test(q)
        ? "business"
        : null;

// Full analysis: public fields plus the provider-free text used by the rules.
export function analyzeQuery(query) {
  const fields = {},
    reasons = [];
  let q = convertNumberWords(norm(query)),
    rest;
  const matches = providerMatchers.filter((p) =>
    p.patterns.some((pattern) => q.match(pattern)),
  );
  if (matches.length)
    fields.provider = matches.sort((a, b) => b.length - a.length)[0].id;
  for (const p of matches)
    for (const pattern of p.patterns) q = q.replace(pattern, " ");
  q = q.replace(/\s+/g, " ").trim();
  rest = q;
  for (const [field, pattern] of [
    [
      "ram",
      /(\d+(?:\.\d+)?)\s*(?:(?:گیگ(?:ابایت)?|gb)\s*)?(?:رم|ram)|(?:رم|ram)\s*(\d+(?:\.\d+)?)/i,
    ],
    ["cpu", /(\d+)\s*(?:هسته|cpu|vcpu|cores?)|(?:cpu|vcpu)\s*(\d+)/i],
    [
      "disk",
      /(\d+(?:\.\d+)?)\s*(?:(?:گیگ(?:ابایت)?|gb)\s*)?(?:فضا|دیسک|ssd|disk)|(?:فضا|دیسک|ssd|disk)\s*(\d+(?:\.\d+)?)/i,
    ],
  ]) {
    const m = q.match(pattern);
    if (m) {
      fields[field] = Number(m[1] || m[2]);
      reasons.push(field);
      rest = rest.replace(m[0], " ");
    }
  }
  // Foreign and negated forms first: «خارج از ایران» contains «ایران».
  if (FOREIGN.test(q)) fields.region = "eu";
  else if (IRAN.test(q)) fields.region = "ir";
  if (/سرور اختصاصی|dedicated/.test(q)) fields.type = "dedicated";
  else if (VPS_WORKLOAD.test(q)) fields.type = "vps";
  else if (WORDPRESS.test(q)) fields.type = "hosting";
  else if (HOSTING.test(q)) fields.type = "hosting";
  else if (VPS.test(q)) fields.type = "vps";
  else if (sitePurpose(q)) fields.type = "hosting";
  // A bare size («هاست ۱۰ گیگ», «سرور ۴ گیگ») is advertised disk for hosting
  // and RAM for a server (then disk if RAM is given). Traffic amounts are not
  // resources, and without a service type the size stays ambiguous.
  for (const m of rest.matchAll(BARE_SIZE)) {
    if (
      /^\s*(?:ترافیک|traffic|پهنای|ماهانه)/u.test(
        rest.slice(m.index + m[0].length),
      )
    )
      continue;
    const field =
      fields.type === "hosting"
        ? "disk"
        : ["vps", "dedicated"].includes(fields.type)
          ? fields.ram === undefined
            ? "ram"
            : "disk"
          : null;
    if (field && fields[field] === undefined) {
      fields[field] = Number(m[1]);
      reasons.push(field);
    }
  }
  const budget = readBudget(q);
  if (budget) fields.maxPrice = budget.value;
  return { fields, reasons, budget, text: q };
}
export function parseQuery(query) {
  const { fields, reasons, budget } = analyzeQuery(query);
  return budget
    ? {
        fields,
        reasons,
        budgetAssumed: budget.assumed,
        budgetUnit: budget.unit,
      }
    : { fields, reasons };
}
// Workload implied by the provider-free text. Website purposes without a
// WordPress keyword only apply to hosting or unspecified service types.
export function inferWorkload(text) {
  const purpose = sitePurpose(text);
  const workload = WORDPRESS.test(text)
    ? "wordpress"
    : /داکر|docker/.test(text)
      ? "docker"
      : /دیتابیس|پایگاه داده|postgres|mysql|redis/.test(text)
        ? "database"
        : /جنگو|django|node|نود|بک اند|backend/.test(text)
          ? "backend"
          : /پایتون|python/.test(text)
            ? "python"
            : purpose
              ? "wordpress"
              : null;
  return {
    workload,
    scenario: workload === "wordpress" ? purpose : null,
    fromPurpose: workload === "wordpress" && !WORDPRESS.test(text),
  };
}
const STOPWORDS = new Set([
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
]);
// Words matched against offer text when the query parses to no filters.
export const queryTokens = (q) =>
  norm(q || "")
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
// True when searchOffers would consult the intent model for these params:
// a query whose service type, provider and workload are not already decided
// by explicit filters or by the rules. Otherwise the scores cannot change
// the result, so inference can be skipped.
export function needsIntentModel(p = {}) {
  if (!p.q) return false;
  const analysis = analyzeQuery(p.q);
  // Keyword fallback: when nothing was parsed, a confident score keeps the
  // results that would otherwise be dropped, whatever the filters are.
  if (!Object.keys(analysis.fields).length && queryTokens(p.q).length)
    return true;
  if (analysis.fields.provider) return false;
  const chosen = (v) =>
    v !== undefined && v !== null && v !== "" && v !== "all";
  if (chosen(p.type) || analysis.fields.type) return false;
  const workload = chosen(p.workload)
    ? p.workload
    : inferWorkload(analysis.text).workload;
  return !workloadTypes[workload];
}
export function estimate(o, { traffic = 200, ip = true } = {}) {
  const parts = [
      {
        label: o.custom ? "منابع پردازشی و دیسک" : "تعرفهٔ پایهٔ ماهانه",
        amount: o.price,
      },
    ],
    warnings = [];
  if (ip && serviceCategory(o.type) !== "hosting") {
    if (o.ipMonthly !== null)
      parts.push({ label: "یک نشانی IPv4", amount: o.ipMonthly });
    else warnings.push("هزینهٔ جداگانهٔ IP در منبع مشخص نشده است.");
  }
  let extra = 0;
  if (serviceCategory(o.type) !== "hosting" && traffic > 0) {
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
    serviceCategory(o.type) === "hosting" &&
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
export { workloadTypes } from "./workloads.mjs";
const unsetChoice = (v) =>
  v === undefined || v === null || v === "" || v === "all";
// Service category implied by the effective filters, if any.
const categoryOf = (filters) =>
  !unsetChoice(filters.type)
    ? filters.type
    : workloadTypes[filters.workload] || null;
// Plausible monthly range (min…max of estimate.total) per service category.
export function priceRange(offers, category, options = {}) {
  let min = Infinity,
    max = -Infinity;
  for (const o of offers) {
    if (category && serviceCategory(o.type) !== category) continue;
    const total = estimate(o, options).total;
    min = Math.min(min, total);
    max = Math.max(max, total);
  }
  return min <= max ? { min, max } : null;
}
const resourceKeys = ["cpu", "ram", "disk"];
// More of every resource first; unknown sorts below any declared amount.
const moreResources = (a, b) => {
  for (const key of resourceKeys) {
    const d = (b[key] ?? -1) - (a[key] ?? -1);
    if (d) return d;
  }
  return 0;
};
export function searchOffers(offers, p, semantic = {}) {
  const analysis = analyzeQuery(p.q || "");
  const intent = { fields: { ...analysis.fields }, reasons: analysis.reasons },
    filters = { ...p, resourceMode: "minimum" };
  for (const [k, v] of Object.entries(intent.fields))
    if (
      filters[k] === undefined ||
      filters[k] === "" ||
      (filters[k] === "all" && !["cpu", "ram", "disk"].includes(k))
    )
      filters[k] = v;
  if (!filters.workload || filters.workload === "all") {
    const inferred = inferWorkload(analysis.text);
    // Explicit service selection wins over an incompatible text workload.
    const compatible =
      filters.type !== "hosting" || workloadTypes[inferred.workload] !== "vps";
    // A site purpose alone («فروشگاهی») never turns a VPS search into WordPress.
    const purposeFits =
      !inferred.fromPurpose ||
      unsetChoice(filters.type) ||
      filters.type === "hosting";
    if (inferred.workload && compatible && purposeFits) {
      filters.workload = inferred.workload;
      if (
        inferred.scenario &&
        (!filters.scenario || filters.scenario === "general")
      )
        filters.scenario = inferred.scenario;
    }
  }
  // A budget or resource amount must not suppress semantic classification.
  // Manual service/workload selections and a provider named in the text
  // («ایران هاست») always remain binding.
  if (
    p.q &&
    !analysis.fields.provider &&
    (!filters.type || filters.type === "all") &&
    !workloadTypes[filters.workload]
  ) {
    const ranked = Object.entries(semantic).sort((a, b) => b[1] - a[1]);
    if (
      ranked[0]?.[1] > INTENT_THRESHOLD &&
      ranked[0][1] - (ranked[1]?.[1] || 0) > INTENT_MARGIN
    ) {
      filters.type = ranked[0][0];
      intent.semanticType = ranked[0][0];
    }
  }
  // Text budgets keep their interpretation visible; an explicit maxPrice wins.
  if (analysis.budget && (p.maxPrice === undefined || p.maxPrice === "")) {
    const budget = analysis.budget;
    let value = budget.value,
      unit = budget.unit;
    if (budget.candidates) {
      const range = priceRange(offers, categoryOf(filters), p);
      const plausible = budget.candidates.filter(
        (c) => range && c >= range.min && c <= range.max,
      );
      if (plausible.length) value = plausible[0];
      unit =
        value === budget.candidates[0] ? "thousand-toman" : "million-toman";
    }
    filters.maxPrice = intent.fields.maxPrice = value;
    intent.budgetAssumed = budget.assumed;
    intent.budgetUnit = unit;
    intent.budgetText = budget.phrase;
  }
  const resourceFilters = Object.fromEntries(
    ["cpu", "ram", "disk"]
      .filter((k) => Number(filters[k]) > 0)
      .map((k) => [k, Number(filters[k])]),
  );
  const selectedProviders = Array.isArray(filters.provider)
    ? filters.provider
    : String(filters.provider || "")
        .split(",")
        .filter(Boolean);
  // Workload floors and explicit resource minima both bind every result.
  const requirements = requirementsFor(filters);
  const targets = Object.fromEntries(
    ["cpu", "ram", "disk"]
      .map((field) => [
        field,
        Math.max(resourceFilters[field] || 0, requirements.minimum[field] || 0),
      ])
      .filter(([, value]) => value > 0),
  );
  let excludedForCapacity = 0;
  let items = offers.filter(
    (o) =>
      (!filters.type ||
        filters.type === "all" ||
        serviceCategory(o.type) === filters.type) &&
      (!workloadTypes[filters.workload] ||
        (workloadTypes[filters.workload] === "hosting"
          ? serviceCategory(o.type) ===
            (["vps", "dedicated"].includes(filters.type)
              ? filters.type
              : "hosting")
          : serviceCategory(o.type) !== "hosting")) &&
      (!filters.region ||
        filters.region === "all" ||
        filters.region === "any" ||
        o.region === filters.region) &&
      (!selectedProviders.length || selectedProviders.includes(o.providerId)) &&
      (!p.saved || p.saved.includes(groupKey(o))),
  );
  items = items.filter((offer) => {
    if (meetsRequirements(offer, requirements)) return true;
    excludedForCapacity++;
    return false;
  });
  const tokens = queryTokens(p.q);
  const hasIntent = Object.keys(intent.fields).length > 0;
  items = items.map((o) => ({
    ...o,
    estimate: estimate(o, { traffic: p.traffic, ip: p.ip }),
    semantic: semantic[o.type] || 0,
  }));
  const requested = Object.entries(targets);
  const legacyOrder = (a, b) =>
    p.sort === "price-desc"
      ? b.min - a.min || a.id.localeCompare(b.id)
      : p.sort === "providers"
        ? b.providerCount - a.providerCount || a.min - b.min
        : p.sort === "ram"
          ? (b.ram || 0) - (a.ram || 0)
          : a.min - b.min;
  // Everything after the budget step, so an empty result can be explained.
  function rank(list) {
    if (p.q && !hasIntent && tokens.length) {
      const matched = list.filter((o) =>
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
      if (matched.length) list = matched;
      else if (Object.values(semantic).some((x) => x > INTENT_THRESHOLD)) {
        const best = Object.entries(semantic).sort(
          (a, b) => b[1] - a[1],
        )[0]?.[0];
        if (!filters.type || filters.type === "all")
          list = list.filter((o) => serviceCategory(o.type) === best);
      } else list = [];
    }
    const grouped = new Map();
    for (const o of list) {
      const key = groupKey(o);
      if (!grouped.has(key))
        grouped.set(key, {
          id: key,
          type: serviceCategory(o.type),
          serviceType: o.type,
          region: o.region,
          cpu: o.cpu,
          ram: o.ram,
          disk: o.disk,
          offers: [],
        });
      grouped.get(key).offers.push(o);
    }
    const eligible = [...grouped.values()]
      .map((g) => {
        g.offers.sort((a, b) => a.estimate.total - b.estimate.total);
        return {
          ...g,
          min: g.offers[0].estimate.total,
          max: g.offers.at(-1).estimate.total,
          providerCount: new Set(g.offers.map((x) => x.providerId)).size,
          differences: [],
        };
      })
      .filter((g) =>
        requested.every(
          ([field, value]) => g[field] != null && g[field] >= value,
        ),
      );
    // Default: the cheapest plan that meets every constraint, then more
    // resources, then id; equal-price ties never rank a dominated plan above
    // the plan that dominates it (0 Pareto violations).
    if (!p.sort || p.sort === "price")
      return paretoOrder(
        eligible.sort(
          (a, b) =>
            a.min - b.min || moreResources(a, b) || a.id.localeCompare(b.id),
        ),
      );
    // `fit` keeps the previous proximity order: relative surplus treats CPU,
    // GB of RAM and GB of disk comparably. Legacy sorts keep their old order.
    const distance = (g) =>
      requested.reduce(
        (sum, [field, value]) => sum + Math.log2(g[field] / value),
        0,
      );
    return eligible
      .map((g) => ({ g, distance: distance(g) }))
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          (p.sort === "fit" ? a.g.min - b.g.min : legacyOrder(a.g, b.g)) ||
          a.g.id.localeCompare(b.g.id),
      )
      .map(({ g }) => g);
  }
  const withinBudget =
    filters.maxPrice !== undefined
      ? items.filter((o) => o.estimate.total <= filters.maxPrice)
      : items;
  const groups = rank(withinBudget);
  let emptyReason = null,
    emptyContext = null;
  if (!groups.length) {
    const category = categoryOf(filters);
    const overBudget = withinBudget.length < items.length ? rank(items) : [];
    if (
      category === "dedicated" &&
      !offers.some((o) => serviceCategory(o.type) === "dedicated")
    )
      emptyReason = "no-dedicated-in-catalog";
    else if (
      filters.region === "eu" &&
      category === "vps" &&
      !offers.some(
        (o) => serviceCategory(o.type) === "vps" && o.region === "eu",
      )
    )
      emptyReason = "no-foreign-vps-in-catalog";
    else if (requirements.blockers.length) emptyReason = "requirements-blocked";
    else if (overBudget.length) {
      emptyReason = "budget-too-low";
      emptyContext = {
        cheapest: Math.min(...overBudget.map((g) => g.min)),
        maxPrice: filters.maxPrice,
      };
    } else emptyReason = "no-match";
  }
  return {
    groups,
    // Retained response fields keep existing API consumers compatible.
    similarGroups: [],
    totalOffers: groups.reduce((n, g) => n + g.offers.length, 0),
    similarTotalOffers: 0,
    similarTotalGroups: 0,
    resourceFilters,
    requirements: { ...requirements, excludedOffers: excludedForCapacity },
    intent,
    filters,
    emptyReason,
    emptyContext,
  };
}

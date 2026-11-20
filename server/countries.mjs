// Countries (ISO 3166-1 alpha-2) and the coarse `region` they belong to.
// `region` stays backward compatible: ir, eu (Europe), unknown, plus `other`
// for a known location outside Iran and Europe (Turkey is not `eu`).
export const COUNTRIES = {
  IR: { fa: "ایران", en: "Iran", region: "ir" },
  DE: { fa: "آلمان", en: "Germany", region: "eu" },
  FI: { fa: "فنلاند", en: "Finland", region: "eu" },
  FR: { fa: "فرانسه", en: "France", region: "eu" },
  NL: { fa: "هلند", en: "Netherlands", region: "eu" },
  GB: { fa: "انگلستان", en: "United Kingdom", region: "eu" },
  SE: { fa: "سوئد", en: "Sweden", region: "eu" },
  PL: { fa: "لهستان", en: "Poland", region: "eu" },
  IT: { fa: "ایتالیا", en: "Italy", region: "eu" },
  ES: { fa: "اسپانیا", en: "Spain", region: "eu" },
  CH: { fa: "سوئیس", en: "Switzerland", region: "eu" },
  AT: { fa: "اتریش", en: "Austria", region: "eu" },
  TR: { fa: "ترکیه", en: "Turkey", region: "other" },
  US: { fa: "آمریکا", en: "United States", region: "other" },
  CA: { fa: "کانادا", en: "Canada", region: "other" },
  AE: { fa: "امارات", en: "United Arab Emirates", region: "other" },
  AM: { fa: "ارمنستان", en: "Armenia", region: "other" },
  JP: { fa: "ژاپن", en: "Japan", region: "other" },
  SG: { fa: "سنگاپور", en: "Singapore", region: "other" },
  MY: { fa: "مالزی", en: "Malaysia", region: "other" },
  IN: { fa: "هند", en: "India", region: "other" },
};
export const countryCodes = Object.keys(COUNTRIES);
export const regionOf = (code) => COUNTRIES[code]?.region || "unknown";

// Query words per country, matched on letter boundaries after provider names
// are removed («ایران‌سرور آلمان» is IranServer in Germany, never Iran).
// Persian adjectives («آلمانی», «آمریکایی») count; «انگلیسی» does not, since
// it usually means the English language.
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";
const WORDS = {
  DE: ["آلمان(?:ی)?", "المان(?:ی)?", "germany", "german", "deutschland"],
  FI: ["فنلاند(?:ی)?", "finland", "finnish"],
  FR: ["فرانسه", "فرانسوی", "france", "french"],
  NL: ["هلند(?:ی)?", "netherlands", "the netherlands", "holland", "dutch"],
  GB: [
    "انگلیس",
    "انگلستان",
    "بریتانیا",
    "united kingdom",
    "great britain",
    "britain",
    "england",
    "uk",
  ],
  SE: ["سوئد(?:ی)?", "sweden"],
  PL: ["لهستان(?:ی)?", "poland"],
  IT: ["ایتالیا(?:یی)?", "italy"],
  ES: ["اسپانیا(?:یی)?", "spain"],
  CH: ["سوئیس(?:ی)?", "switzerland"],
  AT: ["اتریش(?:ی)?", "austria"],
  TR: ["ترکیه(?:\\s*ای)?", "ترکیا", "turkey", "turkiye", "türkiye"],
  US: [
    "آمریکا(?:یی)?",
    "امریکا(?:یی)?",
    "ایالات\\s*متحده(?:\\s*آمریکا)?",
    "united states(?: of america)?",
    "america(?:n)?",
    "usa",
    "u\\.s\\.a?\\.?",
  ],
  CA: ["کانادا(?:یی)?", "canada", "canadian"],
  AE: ["امارات(?:ی)?", "دبی", "uae", "emirates", "dubai"],
  AM: ["ارمنستان", "armenia"],
  JP: ["ژاپن(?:ی)?", "japan"],
  SG: ["سنگاپور(?:ی)?", "singapore"],
  MY: ["مالزی", "malaysia"],
  IN: ["هند", "india"],
};
const COUNTRY_PATTERNS = Object.entries(WORDS).map(([code, words]) => [
  code,
  new RegExp(
    `${L}(?:${words.map((w) => w.replace(/ /g, "\\s+")).join("|")})${R}`,
    "u",
  ),
]);
// The first country named in normalized, provider-free text, or null.
export function findCountry(text) {
  let best = null;
  for (const [code, pattern] of COUNTRY_PATTERNS) {
    const m = pattern.exec(text);
    if (m && (!best || m.index < best.index)) best = { code, index: m.index };
  }
  return best?.code || null;
}

// Every country named in a location label, in order («آلمان, فنلاند hetzner»).
export function countriesIn(text) {
  return COUNTRY_PATTERNS.map(([code, pattern]) => [code, pattern.exec(text)])
    .filter(([, m]) => m)
    .sort((a, b) => a[1].index - b[1].index)
    .map(([code]) => code);
}

// Rows recorded before countries existed: what their official pages state.
// MehrHost and Mizbanfa sell «سرور آلمان»/Germany hosting; Webramz's foreign
// VPS page names «آلمان / فنلاند». Netafraz only says «اروپا» (unspecified).
const LEGACY_COUNTRIES = {
  "mehrhost-host": ["DE"],
  "mizbanfa-host": ["DE"],
  "webramz-vps-eu": ["DE", "FI"],
};
// Adds `countries` (every country the official source names for the offer;
// empty when unstated) and `country` (the single country, else null).
// Offers that already carry `countries` are returned unchanged.
export function locate(o) {
  if (Array.isArray(o.countries)) return o;
  const countries = o.country
    ? [o.country]
    : o.region === "ir"
      ? ["IR"]
      : o.region === "eu"
        ? LEGACY_COUNTRIES[o.sourceId] || []
        : [];
  return {
    ...o,
    countries,
    country: countries.length === 1 ? countries[0] : null,
  };
}
// An offer is in a country when its source names that country, or when its
// source names no country inside the same region («اروپا» for a European
// country); the UI labels the latter «کشور اعلام‌نشده».
export const inCountry = (o, code) =>
  o.countries.includes(code) ||
  (o.countries.length === 0 && o.region === regionOf(code));
// Countries with offers in the catalog, for the location filter.
export function catalogCountries(offers) {
  const counts = new Map();
  for (const o of offers)
    for (const code of locate(o).countries)
      counts.set(code, (counts.get(code) || 0) + 1);
  return [...counts]
    .filter(([code]) => COUNTRIES[code])
    .map(([code, offers]) => ({
      code,
      name: COUNTRIES[code].fa,
      en: COUNTRIES[code].en,
      region: regionOf(code),
      offers,
    }))
    .sort(
      (a, b) =>
        (a.code === "IR" ? -1 : 0) - (b.code === "IR" ? -1 : 0) ||
        b.offers - a.offers ||
        a.code.localeCompare(b.code),
    );
}

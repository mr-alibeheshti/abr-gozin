import { load } from "cheerio";
import { createHash } from "node:crypto";
import { sources, makeOffer, arvanOffers } from "./catalog.mjs";
import { parseExpanded, auxiliaryURLs } from "./expanded-ingest.mjs";
import { number, norm } from "./pricing.mjs";
export function parseLiara(html, stamp) {
  const $ = load(html),
    body = norm($("body").text());
  const traffic = number(
    body.match(/هر گیگابایت ترافیک دانلود،?\s*([\d,٬]+)\s*تومان/)?.[1],
  );
  const ipMatch = body.match(/ماهانه\s+([\d,٬]+)\s*هزار تومان.{0,60}IPv4/i);
  const ip = ipMatch ? number(ipMatch[1]) * 1000 : null;
  if (traffic === null || ip === null)
    throw new Error("هزینهٔ ترافیک یا IP لیارا قابل استخراج نیست");
  const result = [];
  for (const [id, type] of [
    ["iaas", "vps"],
    ["wordpress", "wordpress"],
  ]) {
    const groups = $("#" + id).nextAll();
    let cards;
    for (const el of groups.toArray()) {
      if ($(el).attr("id")) break;
      if ($(el).find(".plan-name").length) {
        cards = $(el);
        break;
      }
    }
    if (!cards) throw new Error("ساختار پلن‌های لیارا تغییر کرده است");
    cards.find(".plan-name").each((i, e) => {
      const card = $(e).parent(),
        specs = {};
      card.find(".spec").each((i, e) => {
        specs[norm($(e).find(".label").text())] = number(
          $(e).find(".value").text(),
        );
      });
      const values = Object.entries(specs);
      const value = (part) => values.find(([k]) => k.includes(part))?.[1];
      const price = value("قیمت ماهانه"),
        cpu = value("cpu"),
        ram = value("ram"),
        disk = value("disk");
      if (![price, cpu, ram, disk].every((x) => Number.isFinite(x) && x > 0))
        throw new Error("منابع یا قیمت لیارا قابل استخراج نیست");
      result.push(
        makeOffer({
          id: `liara-${type}-${cpu}-${ram}-${disk}`,
          sourceId: "liara",
          providerId: "liara",
          type,
          name: $(e).text(),
          cpu,
          ram,
          disk,
          price,
          region: "ir",
          diskType: "SSD",
          ipMonthly: type === "vps" ? ip : 0,
          trafficGB: type === "vps" ? 0 : null,
          trafficRate: type === "vps" ? traffic : null,
          billing: "hourly",
          mode: "crawl",
          verifiedAt: stamp,
          notes:
            type === "vps"
              ? [
                  "ترافیک دانلود به سرور محاسبه می‌شود؛ آپلود رایگان است.",
                  "پهنای باند ۱۰ گیگابیت اشتراکی است.",
                ]
              : [
                  "هاست مدیریت‌شدهٔ وردپرس است و با VPS خام تفاوت دارد.",
                  "هزینه‌های اضافی و محدودیت‌ها را در پنل ارائه‌دهنده بررسی کن.",
                ],
          url: "https://liara.ir/pricing/",
          checkoutUrl: "https://console.liara.ir",
        }),
      );
    });
  }
  return result;
}
export function parseIranserver(html, stamp) {
  const $ = load(html),
    result = [];
  const seen = new Set();
  $("table tbody tr").each((i, e) => {
    const cells = $(e)
      .find("td")
      .toArray()
      .map((e) => $(e).text().trim());
    if (cells.length < 6 || !/^NGP-/.test(cells[0])) return;
    const [name, cpu, ram, disk, traffic, price] = [
      cells[0],
      ...cells.slice(1, 6).map(number),
    ];
    if (
      ![cpu, ram, disk, traffic, price].every(
        (x) => Number.isFinite(x) && x > 0,
      )
    )
      throw new Error("پلن ایران‌سرور معتبر نیست");
    if (seen.has(name)) return;
    seen.add(name);
    const checkout = $(e).find("a").attr("href");
    result.push(
      makeOffer({
        id: `iranserver-${name}`,
        sourceId: "iranserver-vps",
        providerId: "iranserver",
        type: "vps",
        name,
        cpu,
        ram,
        disk,
        trafficGB: traffic,
        price,
        region: "ir",
        diskType: "NVMe",
        ipMonthly: 0,
        mode: "crawl",
        verifiedAt: stamp,
        notes: [
          "IP اختصاصی در ویژگی‌های مشترک سرورها ذکر شده است.",
          "مدل هارد NVMe و پردازنده با نسبت اشتراک ۱ به ۳ در توضیح پلن آمده است.",
          "هزینهٔ ترافیک بیشتر از سهمیه نیازمند بررسی است.",
        ],
        url: "https://www.iranserver.com/vps/iran/",
        checkoutUrl: checkout?.startsWith("https://hub.iranserver.com/")
          ? checkout
          : "https://www.iranserver.com/vps/iran/",
      }),
    );
  });
  if (result.length < 3)
    throw new Error("جدول پلن‌های ایران‌سرور قابل استخراج نیست");
  return result;
}
export function parseArvan(html, stamp) {
  const $ = load(html),
    text = norm($("body").text());
  const cpu = text.match(
    /پردازنده\s+ایران اروپا.{0,600}?Basic\s+[\d,٬]+ تومان\s+([\d,٬]+) تومان/i,
  );
  const ram = text.match(
    /حافظه\s+ایران اروپا.{0,600}?Basic\s+[\d,٬]+ تومان\s+([\d,٬]+) تومان/i,
  );
  const disk = text.match(
    /هر گیگابایت دیسک SSD\s+[\d,٬]+ تومان\s+([\d,٬]+) تومان/i,
  );
  const ip = text.match(/به ازای IPv4 اول\s+([\d,٬]+) تومان/i);
  const traffic = text.match(/250 گیگابایت تا 10 ترابایت\s+([\d,٬]+) تومان/i);
  const rates = {
    cpu: number(cpu?.[1]),
    ram: number(ram?.[1]),
    disk: number(disk?.[1]),
    ip: number(ip?.[1]),
    traffic: number(traffic?.[1]),
  };
  if (Object.values(rates).some((x) => x === null || x <= 0))
    throw new Error("تعرفه‌های واحد آروان با اطمینان قابل استخراج نیست");
  return arvanOffers(rates, stamp, "crawl");
}
export function parseNetafraz(html, stamp, sourceId) {
  const $ = load(html),
    result = [];
  if (!norm($("body").text()).includes("10٪ مالیات"))
    throw new Error("مالیات نت‌افراز قابل تأیید نیست");
  $(".table-div-column").each((i, el) => {
    const card = $(el),
      name = card
        .children()
        .first()
        .find(".pb-2")
        .text()
        .replace(/^سرویس\s*/, "")
        .trim();
    if (!name) return;
    const rows = card.children(".d-flex").toArray();
    if (!rows.length) return;
    const field = (label) =>
      rows.find((e) => norm($(e).children().first().text()).includes(label));
    const disk = number($(field("فضای هاست")).children().last().text()),
      trafficText = norm(
        $(field("پهنای باند ماهیانه")).children().last().text(),
      ),
      traffic = number(trafficText);
    let period = 1,
      prices = $(field("قیمت ماهانه"))
        .find(".sc-price")
        .toArray()
        .map((e) => number($(e).text()));
    if (prices.length !== 2) {
      period = 3;
      prices = $(field("قیمت 3 ماهه"))
        .find(".sc-price")
        .toArray()
        .map((e) => number($(e).text()));
    }
    if (
      !disk ||
      prices.length !== 2 ||
      prices.some((p) => !p || p <= 0) ||
      (!traffic && !trafficText.includes("نامحدود"))
    )
      throw new Error("جدول منابع یا قیمت نت‌افراز تغییر کرده است");
    ["ir", "eu"].forEach((region, j) => {
      const link = card
        .find(region === "ir" ? ".btn-server-ir" : ".btn-server-eu")
        .attr("href");
      const source = sources.find((s) => s.id === sourceId);
      result.push(
        makeOffer({
          id:
            sourceId === "netafraz-standard"
              ? `netafraz-standard-${disk}-${region}`
              : `netafraz-${name.replace(/\s/g, "-")}-${region}`,
          providerId: "netafraz",
          sourceId,
          type: "hosting",
          name,
          disk,
          trafficGB: traffic,
          trafficUnlimited: trafficText.includes("نامحدود"),
          price: prices[j] / period,
          upfront: prices[j],
          period,
          billing: period === 3 ? "quarterly" : "monthly",
          region,
          ipMonthly: 0,
          vatRate: 0.1,
          mode: "crawl",
          verifiedAt: stamp,
          notes: [
            "بکاپ هفتگی، SSL و پنل DirectAdmin در منبع ذکر شده‌اند.",
            period === 3
              ? "پرداخت حداقل سه‌ماهه است؛ مبلغ ماهانه معادل یک‌سوم دوره است."
              : "تعرفه بر اساس کوتاه‌ترین دورهٔ قابل خرید است.",
            "محدودیت بازدید و حجم دیتابیس دارد؛ برای دانلود با اتصال هم‌زمان بالا طراحی نشده است.",
          ],
          url: source.url,
          checkoutUrl: link?.startsWith("https://clients.netafraz.com/")
            ? link
            : source.url,
        }),
      );
    });
  });
  if (result.length < 4)
    throw new Error("جدول پلن‌های نت‌افراز قابل استخراج نیست");
  return result;
}
const allowed = new Set(
  sources.flatMap((s) => {
    const host = new URL(s.url).hostname;
    return [host, host.startsWith("www.") ? host.slice(4) : "www." + host];
  }),
);
allowed.add("portal.mihanhosting.ir");
export async function fetchHTML(url) {
  let target = new URL(url);
  for (let i = 0; i < 4; i++) {
    if (target.protocol !== "https:" || !allowed.has(target.hostname))
      throw new Error("مقصد دریافت مجاز نیست");
    const res = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
      headers: {
        "User-Agent": "Abrgozin/1.0 (public pricing comparison)",
        Accept: "text/html",
      },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      target = new URL(res.headers.get("location"), target);
      continue;
    }
    if (!res.ok) throw new Error("دریافت منبع ناموفق بود: " + res.status);
    if (
      !/text\/(?:html|plain|javascript)|application\/javascript/.test(
        res.headers.get("content-type") || "",
      )
    )
      throw new Error("قالب منبع پشتیبانی نمی‌شود");
    const reader = res.body.getReader();
    let bytes = 0,
      parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 5_000_000) {
        await reader.cancel();
        throw new Error("حجم منبع بیش از حد مجاز است");
      }
      parts.push(value);
    }
    return Buffer.concat(parts).toString("utf8");
  }
  throw new Error("تغییر مسیر بیش از حد مجاز");
}
export async function refreshSources(
  store,
  progress = () => {},
  fetchPage = fetchHTML,
) {
  let index = 0,
    done = 0;
  async function worker() {
    while (index < sources.length) {
      const source = sources[index++],
        checkedAt = new Date().toISOString();
      try {
        const html = await fetchPage(source.url);
        const aux = {};
        for (const url of auxiliaryURLs(source, html))
          aux[url] = await fetchPage(url);
        const hash = createHash("sha256")
          .update(html + Object.values(aux).join("\n"))
          .digest("hex");
        const offers =
          source.id === "liara"
            ? parseLiara(html, checkedAt)
            : source.id === "iranserver-vps"
              ? parseIranserver(html, checkedAt)
              : source.id === "arvan-vps"
                ? parseArvan(html, checkedAt)
                : source.providerId === "netafraz"
                  ? parseNetafraz(html, checkedAt, source.id)
                  : parseExpanded(source, html, checkedAt, aux);
        store.replace(
          source.id,
          offers.map((o) => ({
            ...o,
            sourceHash: hash,
            sourceFetchedAt: checkedAt,
          })),
        );
        store.setStatus({
          id: source.id,
          state: "ok",
          checkedAt,
          verifiedAt: checkedAt,
          count: offers.length,
          hash,
          error: null,
        });
      } catch (e) {
        const old = store.status().find((x) => x.id === source.id);
        store.setStatus({
          id: source.id,
          state: "error",
          checkedAt,
          verifiedAt: old?.verifiedAt || null,
          count: store.offers().filter((o) => o.sourceId === source.id).length,
          error:
            e.name === "TimeoutError" || e.message === "fetch failed"
              ? "دریافت مستقیم از این شبکه انجام نشد؛ آخرین اطلاعات حفظ شد."
              : e.message,
        });
      }
      progress(++done, sources.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return store.status();
}

import { load } from "cheerio";
import { makeOffer } from "./catalog.mjs";
import { number, norm } from "./pricing.mjs";
import { textOf, capture, gb, money, link } from "./expanded-ingest.mjs";
import { COUNTRIES, regionOf, countriesIn } from "./countries.mjs";

// Extractors for official foreign pricing pages (server/foreign-catalog.mjs).
// Rules shared with the other sources: only prices published in toman or
// rial, monthly equivalents with the real billing period kept, null for
// anything the page does not state, and an error (previous data kept) when a
// page no longer states what the extractor relies on.
const billing = (p) =>
  p === 12
    ? "annual"
    : p === 6
      ? "semiannual"
      : p === 3
        ? "quarterly"
        : "monthly";
const positive = (x) => Number.isFinite(x) && x > 0;

function finishForeign(source, stamp, result) {
  if (!result.length)
    throw Error("پلن معتبر در صفحهٔ رسمی پیدا نشد؛ دادهٔ قبلی حفظ شد.");
  const seen = new Map();
  for (const o of result) {
    const cpuOk =
      o.type !== "vps" ||
      positive(o.cpu) ||
      (o.cpu === null && source.cpuUnstated);
    if (
      !o.name ||
      !o.id ||
      ![o.price, o.disk, o.period].every(positive) ||
      (o.type === "vps" && !positive(o.ram)) ||
      !cpuOk ||
      !o.countries?.length ||
      o.countries.some((code) => !COUNTRIES[code])
    )
      throw Error("قیمت، منابع، موقعیت یا دورهٔ پرداخت قابل تأیید نیست.");
    if (seen.has(o.id)) {
      const old = seen.get(o.id);
      if (
        ["cpu", "ram", "disk", "price", "period"].some((k) => old[k] !== o[k])
      )
        throw Error("دادهٔ تکراری ناسازگار در منبع");
      continue;
    }
    seen.set(
      o.id,
      makeOffer({
        sourceId: source.id,
        providerId: source.providerId,
        mode: "crawl",
        verifiedAt: stamp,
        url: source.url,
        checkoutUrl: source.url,
        ...o,
        country: o.countries.length === 1 ? o.countries[0] : null,
        region: regionOf(o.countries[0]),
        billing: billing(o.period),
      }),
    );
  }
  return [...seen.values()];
}

export function parseForeign(source, html, stamp) {
  const $ = load(html),
    result = [];
  const title = textOf($("title"));
  if (!title.includes(norm(source.place)))
    throw Error("صفحهٔ دریافت‌شده صفحهٔ کشور موردنظر نیست.");
  const where = source.country ? [source.country] : null;
  const add = (o, node) =>
    result.push({
      period: 1,
      notes: [],
      countries: where,
      ...o,
      upfront: o.upfront ?? o.price * (o.period || 1),
      evidence: {
        text: node ? textOf(node).slice(0, 3500) : "",
        ...o.evidence,
      },
    });
  const place = COUNTRIES[source.country]?.fa;
  switch (source.parser) {
    case "iranserver":
      $(".pricing-card").each((i, e) => {
        const card = $(e),
          name = card.find(".pricing-card__name").text().replace(/\s+/g, "");
        const priceText = textOf(card.find(".pricing-card__price"));
        // «استعلام از واحد فروش»: no published price, so no offer.
        if (!/\d/.test(priceText)) return;
        if (textOf(card.find(".pricing-card__currency")) !== "تومان")
          throw Error("واحد قیمت ایران‌سرور تغییر کرد.");
        const description = textOf(card.find(".pricing-card__description"));
        const period =
          description === "به ازای هر ماه"
            ? 1
            : description === "به ازای هر ماه در پرداخت سالانه"
              ? 12
              : null;
        if (!period) throw Error("دورهٔ پرداخت ایران‌سرور قابل تأیید نیست.");
        const features = card
          .find(".pricing-card__feature-text")
          .map((i, x) => textOf($(x)))
          .get();
        const feature = (label) =>
          features.find((t) => t.startsWith(norm(label))) || "";
        const traffic = feature("ترافیک ماهیانه"),
          disk = feature("فضا"),
          price = number(priceText),
          real = number(textOf(card.find(".pricing-card__realprice")));
        add(
          {
            id: `iranserver-${source.country.toLowerCase()}-${name}`,
            name,
            type: "vps",
            cpu: capture(feature("پردازنده"), /(\d+)\s*vcores?/),
            ram: gb(feature("رم")),
            disk: capture(disk, /(\d+)\s*gb/),
            diskType: /nvme/.test(disk) ? "NVMe" : "نامشخص",
            trafficGB: traffic.includes("نامحدود") ? null : gb(traffic),
            trafficUnlimited: traffic.includes("نامحدود"),
            ipMonthly: number(feature("ip اختصاصی")) === 1 ? 0 : null,
            price,
            period,
            checkoutUrl: link(
              card.find(".pricing-card__button a[href]").attr("href"),
              source,
            ),
            notes: [
              period === 12
                ? `قیمت ماهانه فقط در پرداخت سالانه اعلام شده است${real ? `؛ قیمت بدون تخفیف ${real.toLocaleString("en-US")} تومان درج شده است` : ""}.`
                : "تعرفهٔ پرداخت ماهانه از صفحهٔ رسمی است.",
              `در صفحهٔ رسمی «سرور مجازی ${place}» آمده است؛ برخی پلن‌ها با همان شناسهٔ سفارش در صفحهٔ کشور دیگری هم آمده‌اند، پس موقعیت را هنگام سفارش بررسی کن.`,
            ],
          },
          card,
        );
      });
      break;
    case "bertina": {
      // Order cards carry the monthly toman price; the official structured
      // data repeats it in rial. Both must agree.
      const structured = new Map();
      $('script[type="application/ld+json"]').each((i, e) => {
        let d;
        try {
          d = JSON.parse($(e).text());
        } catch {
          return;
        }
        if (d["@type"] !== "ItemList") return;
        for (const { item } of d.itemListElement || []) {
          if (item?.offers?.priceCurrency !== "IRR")
            throw Error("واحد قیمت برتینا تغییر کرد.");
          const pid = new URL(item.offers.url).searchParams.get("pid");
          structured.set(pid, item);
        }
      });
      $('a[href*="cart.php?a=add&pid="]').each((i, e) => {
        let card = $(e);
        for (let j = 0; j < 8 && !textOf(card).includes("monthly traffic"); j++)
          card = card.parent();
        // The comparison table and page chrome hold several order links.
        if (card.find('a[href*="cart.php?a=add&pid="]').length !== 1) return;
        const s = textOf(card),
          href = $(e).attr("href"),
          pid = new URL(href, source.url).searchParams.get("pid"),
          item = structured.get(pid),
          m = s.match(/([\d.,]+)\s*(میلیون|هزار)\s*تومان\s*ماهیانه/),
          monthly = m
            ? Math.round(number(m[1]) * (m[2] === "میلیون" ? 1e6 : 1e3))
            : null,
          plan = item?.name.match(/DEVDS\s*-?\s*(\d+)/i)?.[1];
        if (!item || !plan || monthly !== Number(item.offers.price) / 10)
          throw Error(
            "قیمت کارت سفارش و دادهٔ ساختاریافتهٔ برتینا هم‌خوان نیست.",
          );
        add(
          {
            id: `bertina-de-DEVDS-${plan}`,
            name: `DEVDS-${plan}`,
            type: "vps",
            cpu: capture(s, /cpu\s*(\d+)\s*core/),
            ram: capture(s, /ram\s*(\d+)\s*gb/),
            disk: capture(s, /storage\s*(\d+)\s*gb/),
            diskType: /storage\s*\d+\s*gb\s*nvme/.test(s) ? "NVMe" : "نامشخص",
            trafficGB: gb(
              s.match(/monthly traffic\s*([\d.]+\s*(?:tb|gb))/)?.[1] || "",
            ),
            ipMonthly:
              capture(s, /ip\s*\(قابل ارتقا\)\s*(\d+)/) === 1 ? 0 : null,
            price: monthly,
            checkoutUrl: link(href, source),
            notes: [
              "قیمت ماهانهٔ کارت سفارش با دادهٔ ساختاریافتهٔ رسمی (ریال) یکی است.",
              "جدول مقایسهٔ همین صفحه قیمت‌های کمتری نشان می‌دهد که با کارت سفارش هم‌خوان نیست؛ مبلغ نهایی را در سبد خرید بررسی کن.",
            ],
          },
          card,
        );
      });
      break;
    }
    case "hidata": {
      const page = textOf($("body"));
      // The plan table switches between «ماهانه» (m1) and «سه ماهه» (m2).
      if (
        !page.includes("ماهانه سه ماهه") ||
        !page.includes("ترافیک ماهانه نامحدود")
      )
        throw Error("دوره یا ترافیک صفحهٔ های‌دیتا قابل تأیید نیست.");
      const pattern = new RegExp(`^${source.planPrefix}-\\d+GB$`);
      $(".plan").each((i, e) => {
        const c = $(e),
          name = c.find(".title").text().trim(),
          s = textOf(c);
        if (!pattern.test(name)) return;
        add(
          {
            id: "hidata-" + name,
            name,
            type: "vps",
            cpu: capture(s, /پردازنده\s*(\d+)\s*هسته/),
            ram: capture(s, /رم\s*(\d+)\s*گیگابایت/),
            disk: capture(s, /(?:فضا|هارد)\s*(\d+)\s*گیگابایت/),
            diskType: /nvme/.test(s)
              ? "NVMe"
              : /^DE-SATA/.test(name)
                ? "SATA"
                : "نامشخص",
            trafficGB: null,
            trafficUnlimited: true,
            ipMonthly: null,
            price: number(c.find(".price-num.m1").text()),
            checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
            notes: [
              "تعرفهٔ پرداخت ماهانه است؛ قیمت سه‌ماهه در صفحه جداگانه آمده است.",
              "ترافیک ماهانهٔ نامحدود و دیتاسنتر Hetzner آلمان در صفحه ذکر شده‌اند؛ هزینهٔ IP در مشخصات پلن نیامده است.",
            ],
          },
          c,
        );
      });
      break;
    }
    case "parsvds": {
      const page = textOf($("body"));
      // The table has no period column; the page's own FAQ states the base
      // period is one month and longer periods are chosen at checkout.
      if (!/امکان خرید سرویس بیش از یک ماه وجود دارد/.test(page))
        throw Error("دورهٔ پرداخت پارس وی‌دی‌اس قابل تأیید نیست.");
      $(".server-tabls-body .server-tabls-row-vps").each((i, e) => {
        const c = $(e),
          cells = c.children("div"),
          name = cells.eq(0).find("b").text().trim();
        // Plan names vary per page (de_vps_2gb, apex2, «4 گیگ»); Iran rows never.
        if (!name || /^ir[_\s-]/i.test(name)) return;
        const header = textOf(c.closest(".server-tabls-body").prev());
        if (
          !/قیمت (?:تومان|ماهانه)/.test(header) ||
          /سه ماهه|شش ماهه|سالانه/.test(header)
        )
          throw Error("ستون قیمت پارس وی‌دی‌اس تغییر کرد.");
        const cell = (j) => textOf(cells.eq(j)),
          href = c.find(".server-order-button").attr("href"),
          pid = new URL(href, source.url).searchParams.get("pid");
        add(
          {
            id: `parsvds-${source.country.toLowerCase()}-${pid}`,
            name,
            type: "vps",
            cpu: capture(cell(1), /(\d+)\s*هسته/),
            ram: capture(cell(2), /(\d+(?:\.\d+)?)\s*gb/),
            disk: capture(cell(3), /(\d+)\s*gb/),
            diskType: /nvme\s*\/\s*ssd/.test(cell(3))
              ? "NVMe/SSD"
              : /nvme/.test(cell(3))
                ? "NVMe"
                : /ssd/.test(cell(3))
                  ? "SSD"
                  : "نامشخص",
            trafficGB: gb(cell(4).match(/([\d.]+\s*(?:tb|gb))/)?.[1] || ""),
            ipMonthly: null,
            price:
              money(cell(6)) ?? money(textOf(c.find(".server-order-button"))),
            checkoutUrl: link(href, source),
            notes: [
              "جدول دورهٔ پرداخت ندارد؛ پرسش‌های متداول همین صفحه دورهٔ پایه را یک ماه و دوره‌های ۳، ۶ و ۱۲ ماهه را انتخابی می‌داند.",
              "هزینهٔ IP و ترافیک اضافه در جدول ذکر نشده است.",
            ],
          },
          c,
        );
      });
      break;
    }
    case "serverir":
      $(".isotope-item:not(.title)").each((i, e) => {
        const c = $(e),
          v = c
            .children("span.item-data")
            .map((i, e) => textOf($(e)))
            .get();
        // VPS: name, cpu, ram, disk, location, traffic, price.
        // Hosting: name, disk, databases, addon domains, traffic, location, price.
        if (v.length !== 7 || /^ir/.test(v[0])) return;
        if (source.hosting) {
          const name = c.children(".item-data").first().text().trim(),
            countries = countriesIn(v[5]),
            s = textOf(c);
          if (!countries.length) return;
          const tariff = JSON.parse(
            c.find(".price[data-price]").attr("data-price") || "{}",
          );
          if (!tariff.month) throw Error("تعرفهٔ ماهانهٔ سرور.آی‌آر مشخص نیست");
          for (const code of countries)
            add(
              {
                id: `serverir-${name.replace(/\s+/g, "")}-${code.toLowerCase()}`,
                name,
                type: "hosting",
                countries: [code],
                cpu: capture(s, /پردازنده:\s*(\d+)\s*vcore/),
                ram: gb(s.match(/رم:\s*([\d.]+\s*(?:gb|mb))/)?.[1] || ""),
                disk: gb(v[1]),
                diskType: /nvme/.test(v[1]) ? "NVMe" : "نامشخص",
                trafficGB: null,
                trafficUnlimited: v[4] === "نامحدود",
                ipMonthly: 0,
                price: money(textOf(load(tariff.month)("body"))),
                checkoutUrl: link(
                  c.find("a[href]").first().attr("href"),
                  source,
                ),
                notes: [
                  `موقعیت‌های این هاست در منبع: «${v[5]}»؛ موقعیت را هنگام سفارش انتخاب و بررسی کن.`,
                  "منابع اعلام‌شده مربوط به حساب هاست‌اند؛ تعرفهٔ ماهانه از دادهٔ همان ردیف است.",
                ],
              },
              c,
            );
          return;
        }
        const name = c.children(".item-data").first().text().trim(),
          countries = countriesIn(v[4]);
        // «+10 کشور جهان» names no country, so it is not listed.
        if (!countries.length) return;
        const tariff = JSON.parse(
          c.find(".price[data-price]").attr("data-price") || "{}",
        );
        if (!tariff.month) throw Error("تعرفهٔ ماهانهٔ سرور.آی‌آر مشخص نیست");
        const price = money(textOf(load(tariff.month)("body"))),
          traffic = v[5];
        for (const code of countries)
          add(
            {
              id: `serverir-${name}-${code.toLowerCase()}`,
              name,
              type: "vps",
              countries: [code],
              cpu: number(v[1]),
              ram: gb(v[2]),
              disk: gb(v[3]),
              diskType: /nvme/.test(v[3]) ? "NVMe" : "نامشخص",
              trafficGB: traffic.includes("نامحدود")
                ? null
                : gb(traffic.match(/([\d.]+\s*(?:tb|gb))/)?.[1] || ""),
              trafficUnlimited: traffic.startsWith("نامحدود"),
              ipMonthly: null,
              price,
              checkoutUrl: link(c.find("a[href]").first().attr("href"), source),
              notes: [
                `موقعیت‌های این پلن در منبع: «${v[4]}»؛ موقعیت را هنگام سفارش انتخاب و بررسی کن.`,
                "تعرفهٔ ماهانه از دادهٔ همان ردیف است؛ هزینهٔ IP در جدول ذکر نشده است.",
              ],
            },
            c,
          );
      });
      break;
    case "azaronline": {
      // «… تومان/ماهانه در صورت خرید سالانه»: a monthly equivalent of an
      // annual payment. Traffic is unlimited «(اروپا و آمریکا)» and a stated
      // TB for «سایر موقعیت ها»; Canada is not clearly either, so unknown.
      const unlimitedHere =
        regionOf(source.country) === "eu" || source.country === "US";
      const otherHere = !unlimitedHere && source.country !== "CA";
      $(".plan").each((i, e) => {
        const c = $(e),
          name = c.find(".plan-title").text().trim(),
          s = textOf(c),
          n = name.match(/^سرور مجازی لینوکس (\d+)$/)?.[1];
        if (!n) return;
        const m = s.match(
            /([\d,٬]+)\s*تومان\s*\/\s*ماهانه در صورت خرید سالانه/,
          ),
          traffic = capture(s, /آمریکا\)\s*([\d.]+)\s*ترابایت\s*سایر موقعیت/);
        if (!m || !s.includes("ترافیک نامحدود(اروپا و آمریکا)"))
          throw Error("دوره یا ترافیک آذرآنلاین قابل تأیید نیست.");
        add(
          {
            id: `azaronline-${source.country.toLowerCase()}-linux-${n}`,
            name,
            type: "vps",
            cpu: capture(s, /پردازنده\s*(\d+)\s*هسته/),
            ram: capture(s, /رم\s*(\d+)\s*مگابایت/) / 1024,
            disk: capture(s, /هارد\s*(\d+)\s*گیگابایت/),
            trafficGB: otherHere && traffic ? traffic * 1000 : null,
            trafficUnlimited: unlimitedHere,
            ipMonthly: s.includes("یک عدد ipv4") ? 0 : null,
            price: number(m[1]),
            period: 12,
            checkoutUrl: source.url,
            notes: [
              "قیمت ماهانهٔ نمایش‌داده‌شده فقط در خرید سالانه معتبر است.",
              "همین پلن‌ها در صفحه‌های کشورهای دیگر آذرآنلاین هم آمده‌اند؛ موقعیت هنگام سفارش انتخاب می‌شود. RAM با مبنای ۱۰۲۴ از مگابایت تبدیل شده است.",
              unlimitedHere
                ? "ترافیک برای اروپا و آمریکا نامحدود اعلام شده است."
                : otherHere
                  ? "برای «سایر موقعیت‌ها» سهمیهٔ ترافیک ترابایتی اعلام شده است."
                  : "روشن نیست کانادا جزو «آمریکا» در جملهٔ ترافیک است؛ ترافیک نامشخص ثبت شد.",
            ],
          },
          c,
        );
      });
      break;
    }
    case "webramz":
      $(".plan").each((i, e) => {
        const card = $(e),
          name = card.find(".plan-name").text().trim();
        if (!/^OCVPS-\d+$/.test(name)) return;
        const detail = (label) =>
          textOf(
            card
              .find(".plan-details li")
              .filter((i, row) => textOf($(row)).startsWith(norm(label)))
              .find("strong"),
          );
        const disk = textOf(card.find(".plan-details .disk strong")),
          monthly = textOf(card.find(".monthly-price.top"));
        if (
          !detail("موقعیت سرور").includes(norm(place)) ||
          number(detail("ip")) !== 1 ||
          !detail("ترافیک ماهانه").includes("نامحدود") ||
          !monthly.includes("ماهانه")
        )
          throw Error("مشخصات پلن خارجی وب‌رمز قابل تأیید نیست.");
        add(
          {
            id: `webramz-${source.country.toLowerCase()}-${name}`,
            name,
            type: "vps",
            cpu: capture(detail("تعداد پردازنده"), /^(\d+)x/),
            ram: gb(detail("حجم رم")),
            disk: gb(disk),
            diskType: /nvme/.test(disk)
              ? "NVMe"
              : /ssd/.test(disk)
                ? "SSD"
                : "نامشخص",
            trafficGB: null,
            trafficUnlimited: true,
            ipMonthly: 0,
            price: money(monthly),
            checkoutUrl: link(
              card.find('a[href*="cart.php"]').attr("href"),
              source,
            ),
            notes: [
              `موقعیت سرور در منبع «${place}» و دیتاسنتر ${detail("دیتاسنتر").toUpperCase()} است.`,
              "تعرفه مربوط به پرداخت ماهانه است؛ تخفیف دوره‌های بلندتر لحاظ نشده است. ترافیک نامحدود و یک IP در منبع درج شده‌اند.",
            ],
          },
          card,
        );
      });
      break;
    case "iranhost": {
      if (!textOf($("body")).includes("کانادا"))
        throw Error("سرورهای کانادای ایران‌هاست در صفحه نیست.");
      $(".plan-card").each((i, e) => {
        const c = $(e),
          name = c.find(".card-code").text().trim();
        if (!/^VPS-CA-/.test(name)) return;
        const s = textOf(c.find(".plan-desc")),
          large = textOf(c.find(".card-price-large")),
          traffic = s.match(/([\d.]+\s*[tg]b)\s*traffic/)?.[1];
        if (!large.includes("1 ساله") || !large.includes("تومان در ماه"))
          throw Error("دورهٔ ایران‌هاست قابل تأیید نیست");
        add(
          {
            id: "iranhost-" + name,
            name,
            type: "vps",
            cpu: capture(s, /(\d+)\s*cpu\s*core/),
            ram: capture(s, /(\d+)\s*gb\s*ram/),
            disk: capture(s, /(\d+)\s*gb\s*nvme/),
            diskType: "NVMe",
            trafficGB: traffic ? gb(traffic) : null,
            price: money(
              textOf(c.find(".card-price-large .card-price")) + " تومان",
            ),
            period: 12,
            checkoutUrl: source.url,
            notes: [
              "قیمت منتشرشده به میلیون تومان گرد شده و معادل ماهانه در پرداخت یک‌ساله است. مبلغ نهایی باید در پنل فروشنده تأیید شود.",
              "کد پلن VPS-CA در صفحهٔ «سرورهای مجازی ایران و کانادا» آمده است؛ سهمیهٔ ترافیک از جزئیات خود پلن است.",
            ],
          },
          c,
        );
      });
      break;
    }
    case "onlineserver":
      $("article")
        .filter((i, e) => $(e).find('h3[class*="planName"]').length > 0)
        .each((i, e) => {
          const c = $(e),
            s = textOf(c),
            name = c.find("h3").text().trim(),
            m = s.match(/(?:^|\s)(از\s+)?([\d,٬]+)\s*تومان\s*\/\s*ماهانه/);
          if (!m) throw Error("دورهٔ آنلاین سرور تغییر کرد.");
          // «از …» is a starting price that varies by location: not a tariff.
          if (m[1]) throw Error("قیمت قطعی پلن آنلاین سرور اعلام نشده است.");
          const href = c.find("a[href]").last().attr("href") || "",
            url = new URL(href, source.url),
            slug =
              url.searchParams.get("rp")?.split("/").pop() ||
              [url.searchParams.get("plan"), url.searchParams.get("location")]
                .filter(Boolean)
                .join("-"),
            discount = s.match(/([\d,٬]+)\s*(\d+)\s*٪\s*تخفیف/),
            traffic = s.match(/ترافیک\s*([\d.]+\s*(?:tb|gb))/)?.[1];
          if (!slug) throw Error("شناسهٔ سفارش آنلاین سرور پیدا نشد.");
          add(
            {
              id: "onlineserver-" + slug,
              name,
              type: source.hosting ? "wordpress" : "vps",
              cpu: source.hosting
                ? null
                : capture(s, /پردازنده\s*(\d+)\s*هسته/),
              ram: source.hosting ? null : capture(s, /رم\s*(\d+)\s*گیگابایت/),
              disk: source.hosting
                ? capture(textOf(c.find("h3")), /^(\d+)\s*گیگابایت/)
                : capture(s, /دیسک\s*(\d+)\s*gb/),
              diskType: /دیسک\s*\d+\s*gb\s*nvme/.test(s)
                ? "NVMe"
                : source.diskType || "نامشخص",
              trafficGB: traffic ? gb(traffic) : null,
              ipMonthly: source.hosting ? 0 : null,
              price: number(m[2]),
              checkoutUrl: link(href, source),
              notes: [
                ...(discount
                  ? [
                      `قیمت با ${discount[2]}٪ تخفیف اعلام‌شده در صفحه است؛ قیمت بدون تخفیف ${discount[1]} تومان.`,
                    ]
                  : []),
                source.hosting
                  ? "هاست وردپرس روی OVH فرانسه، طبق صفحهٔ رسمی؛ CPU و RAM اعلام نشده‌اند."
                  : source.cpuUnstated
                    ? "تعداد هستهٔ CPU، نوع دیسک و ترافیک در کارت پلن ذکر نشده‌اند."
                    : "هزینهٔ IP و ترافیک اضافه در کارت پلن ذکر نشده است.",
              ],
            },
            c,
          );
        });
      break;
    default:
      throw Error("استخراج‌گر این منبع تعریف نشده است");
  }
  return finishForeign(source, stamp, result);
}

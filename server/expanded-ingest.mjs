import { load } from "cheerio";
import { createHash } from "node:crypto";
import { makeOffer } from "./catalog.mjs";
import { number, norm, digits } from "./pricing.mjs";

// Do not run supplier scripts. Text and JSON-LD are treated only as data.
export function textOf(node) {
  const walk = (e) =>
    e.type === "text"
      ? e.data
      : ["script", "style", "svg", "noscript"].includes(e.name)
        ? ""
        : (e.children || []).map(walk).join(" ");
  return norm(node.toArray().map(walk).join(" ")).replace(/٫/g, ".");
}
const capture = (s, re) => number(s.match(re)?.[1]);
const gb = (s) => {
  const n = number(s);
  if (n === null) return null;
  return /(?:مگابایت|mb(?:$|\s))/i.test(s)
    ? n / 1000
    : /(?:ترابایت|tb(?:$|\s))/i.test(s)
      ? n * 1000
      : n;
};
const money = (s) => {
  const m = norm(s)
    .replace(/٫/g, ".")
    .match(/([\d.,٬،]+)\s*(میلیون|هزار)?\s*تومان/);
  return m
    ? number(m[1]) * (m[2] === "میلیون" ? 1e6 : m[2] === "هزار" ? 1e3 : 1)
    : null;
};
const billing = (p) =>
  p === 12
    ? "annual"
    : p === 6
      ? "semiannual"
      : p === 3
        ? "quarterly"
        : "monthly";
const checkoutHosts = new Set([
  "client.saba.host",
  "my.webramz.com",
  "my.parsvds.com",
  "my.payamonline.com",
  "mihanwebhost.com",
  "my.server.ir",
  "cloud.server.ir",
  "portal.server.ir",
  "server.ir",
  "iranhost.com",
  "my.iranhost.com",
  "mizbanfa.net",
  "my.mizbanfa.net",
  "azaronline.com",
  "my.azaronline.com",
  "clients.bertina.us",
  "my.onlineserver.ir",
  "onlineserver.ir",
  "my.hidata.org",
  "afagh.info",
  "my.afagh.info",
  "webdade.com",
  "my.webdade.com",
  "clients.webdade.com",
  "www.talahost.com",
  "talahost.com",
  "my.hostnegar.com",
  "hostnegar.com",
  "portal.mihanhosting.ir",
  "mehrhost.com",
  "my.mehrhost.com",
]);
const link = (href, source) => {
  try {
    const u = new URL(href, source.url);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      checkoutHosts.has(u.hostname)
      ? u.href
      : source.url;
  } catch {
    return source.url;
  }
};
function finish(source, stamp, result) {
  if (!result.length)
    throw Error("پلن معتبر در صفحهٔ رسمی پیدا نشد؛ دادهٔ قبلی حفظ شد.");
  const seen = new Map();
  for (const o of result) {
    if (
      !o.name ||
      !o.id ||
      ![o.price, o.disk, o.period].every((x) => Number.isFinite(x) && x > 0) ||
      (o.type === "vps" &&
        ![o.cpu, o.ram].every((x) => Number.isFinite(x) && x > 0))
    )
      throw Error("قیمت، منابع یا دورهٔ پرداخت قابل تأیید نیست.");
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
        region: "ir",
        mode: "crawl",
        verifiedAt: stamp,
        url: source.url,
        checkoutUrl: source.url,
        ...o,
        billing: billing(o.period || 1),
      }),
    );
  }
  return [...seen.values()];
}
export function auxiliaryURLs(source, html) {
  if (source.providerId !== "mihanhosting") return [];
  const $ = load(html);
  const urls = $("script[src]")
    .map((i, e) => $(e).attr("src"))
    .get()
    .filter((s) => {
      try {
        const u = new URL(s);
        return (
          u.protocol === "https:" &&
          u.hostname === "portal.mihanhosting.ir" &&
          u.pathname === "/feeds/productsinfo.php" &&
          u.searchParams.get("get") === "price" &&
          u.searchParams.get("billingcycle") === "monthly" &&
          ["224", "222", "223", "225"].includes(u.searchParams.get("pid"))
        );
      } catch {
        return false;
      }
    });
  if (new Set(urls).size !== 4)
    throw Error("فید تعرفهٔ میهن هاستینگ تغییر کرده است.");
  return [...new Set(urls)];
}
export function parseExpanded(source, html, stamp, aux = {}) {
  const $ = load(html),
    result = [];
  const add = (o, node) =>
    result.push({
      period: 1,
      notes: [],
      ...o,
      evidence: {
        text: node ? textOf(node).slice(0, 3500) : o.evidence?.text || "",
        ...o.evidence,
      },
    });
  const rows = (table) =>
    table
      .find("tr")
      .toArray()
      .map((e) => $(e).children("th,td"));
  const field = (r, label) => r.find((c) => textOf(c.first()).includes(label));
  const val = (r, label, j) => {
    const row = field(r, label);
    if (!row) throw Error("ردیف " + label + " پیدا نشد");
    return textOf(row.eq(j + 1));
  };
  switch (source.providerId) {
    case "saba":
      $(".wp-price-card[data-pid]").each((i, e) => {
        const card = $(e),
          order = card.find(".wp-btn-order");
        if (order.hasClass("disabled") || textOf(order).includes("تکمیل"))
          return;
        const value = (label) =>
          card
            .find(".wp-features-list li")
            .filter((i, row) =>
              textOf($(row).find(".feature-label")).includes(norm(label)),
            )
            .find(".feature-value");
        const price = number(card.attr("data-monthly")),
          name = card.find(".wp-plan-name").text().trim(),
          traffic = textOf(value("ترافیک")),
          checkout = new URL(link(order.attr("data-base-url"), source));
        checkout.searchParams.set("billingcycle", "monthly");
        if (
          !/^WPH-\d+$/.test(name) ||
          !traffic.includes("نامحدود") ||
          ![number(textOf(value("CPU"))), gb(textOf(value("رم")))].every(
            (x) => Number.isFinite(x) && x > 0,
          ) ||
          !/nvme/i.test(textOf(value("هارد")))
        )
          throw Error("ساختار تعرفهٔ وردپرس صباهاست تغییر کرده است.");
        add(
          {
            id: "saba-" + name,
            name,
            type: "wordpress",
            region: "unknown",
            disk: gb(textOf(card.find(".wp-plan-space"))),
            cpu: number(textOf(value("CPU"))),
            ram: gb(textOf(value("رم"))),
            diskType: "NVMe",
            price,
            upfront: price,
            trafficUnlimited: true,
            ipMonthly: 0,
            checkoutUrl: checkout.href,
            notes: [
              "تعرفه مربوط به پرداخت ماهانه است؛ تخفیف پرداخت سالانه لحاظ نشده است.",
              "منابع مربوط به حساب هاست‌اند؛ محل دقیق این پلن در جدول اعلام نشده است.",
            ],
            evidence: { monthlyPrice: card.attr("data-monthly") },
          },
          card,
        );
      });
      break;
    case "webramz":
      $(".plan").each((i, e) => {
        const card = $(e),
          name = card.find(".plan-name").text().trim();
        if (!/^VDS-\d+e$/.test(name)) return;
        const detail = (label) =>
          card
            .find(".plan-details li")
            .filter((i, row) => textOf($(row)).includes(norm(label)))
            .find("strong");
        if (
          textOf(detail("موقعیت")) !== "ایران" ||
          !/nvme/i.test(textOf(card.find(".plan-details .disk strong"))) ||
          number(textOf(detail("IP"))) !== 1
        )
          throw Error("مشخصات پلن وب‌رمز قابل تأیید نیست.");
        const price = money(textOf(card.find(".monthly-price.top"))),
          order = card.find('a[href*="cart.php"]');
        add(
          {
            id: "webramz-" + name,
            name,
            type: "vps",
            region: "ir",
            disk: gb(textOf(card.find(".plan-details .disk strong"))),
            cpu: capture(textOf(detail("پردازنده")), /^(\d+)x/i),
            ram: gb(textOf(detail("رم"))),
            diskType: "NVMe",
            trafficGB: gb(textOf(detail("ترافیک ماهانه"))),
            ipMonthly: number(textOf(detail("IP"))) === 1 ? 0 : null,
            price,
            upfront: price,
            checkoutUrl: link(order.attr("href"), source),
            notes: [
              "تعرفه مربوط به پرداخت ماهانه است؛ تخفیف دوره‌های بلندتر لحاظ نشده است.",
              "مجازی‌ساز KVM و یک IP در جدول درج شده‌اند؛ تعرفهٔ ترافیک اضافه مشخص نیست.",
            ],
          },
          card,
        );
      });
      break;
    case "parsvds":
      $(".server-tabls-body.month .server-tabls-row-vps").each((i, e) => {
        const c = $(e),
          cells = c.children("div"),
          name = cells.eq(0).find("b").text().trim();
        if (!/^IR_VPS_/i.test(name)) return;
        add(
          {
            id: "parsvds-" + name,
            name,
            type: "vps",
            cpu: number(cells.eq(2).find("b").text()),
            ram: number(cells.eq(3).find("b").text()),
            disk: number(cells.eq(4).find("b").text()),
            diskType: /nvme/i.test(cells.eq(4).text()) ? "NVMe" : "SSD",
            trafficGB: number(cells.eq(5).find("b").text()),
            price: money(textOf(c.find(".server-order-button"))),
            checkoutUrl: link(
              c.find(".server-order-button").attr("href"),
              source,
            ),
            notes: [
              "تعرفه از جدول پرداخت ماهانه استخراج شده است. هزینهٔ ترافیک اضافه نیازمند بررسی در پنل فروشنده است.",
            ],
          },
          c,
        );
      });
      break;
    case "payamonline":
      $(".product").each((i, e) => {
        const c = $(e),
          s = textOf(c.find(".product-desc")),
          name = c.find("header span").text().trim();
        if (!/^IRVPS-/.test(name)) return;
        if (!textOf(c.find(".product-pricing")).includes("ماهانه"))
          throw Error("دورهٔ پیام آنلاین تغییر کرد");
        add(
          {
            id: "payamonline-" + name,
            name,
            type: "vps",
            cpu: capture(s, /(\d+)\s*core\s*cpu/),
            ram: capture(s, /(\d+)\s*gb\s*ram/),
            disk: capture(s, /(\d+)\s*gb\s*[–-]?\s*(?:hard|hhd)/),
            diskType: "SSD",
            ipMonthly: s.includes("ip dedicated") ? 0 : null,
            price: money(textOf(c.find(".price"))),
            checkoutUrl: link(c.find(".btn-order-now").attr("href"), source),
          },
          c,
        );
      });
      break;
    case "mihanwebhost": {
      const t = $("table")
          .filter(
            (i, e) =>
              textOf($(e)).includes("تعداد هسته cpu") &&
              textOf($(e)).includes("هزینه ماهیانه"),
          )
          .first(),
        r = rows(t),
        orders = field(r, "سفارش");
      if (!orders || orders.length !== 9)
        throw Error("ستون‌های میهن وب هاست تغییر کردند");
      for (let j = 0; j < 8; j++) {
        const order = orders.eq(j + 1),
          href = order.find("a").attr("href"),
          priceText = val(r, "هزینه ماهیانه", j);
        if (
          !href ||
          textOf(order).includes("خبرم") ||
          priceText.includes("تکمیل ظرفیت")
        )
          continue;
        const pid = new URL(href, source.url).searchParams.get("pid") || j + 1;
        add(
          {
            id: "mihanwebhost-" + pid,
            name: `پلن ایران ${j + 1}`,
            type: "vps",
            cpu: number(val(r, "تعداد هسته cpu", j)),
            ram: number(val(r, "ram", j)) / 1024,
            disk: number(val(r, "ظرفیت حافظه", j)),
            trafficGB: gb(val(r, "پهنای باند", j)),
            ipMonthly: 0,
            price: money(priceText),
            checkoutUrl: link(href, source),
            notes: [
              "IP اختصاصی در صفحه ذکر شده است. CPU و پورت شبکه اشتراکی هستند؛ RAM از مگابایت با مبنای ۱۰۲۴ تبدیل شده است.",
            ],
            evidence: {
              text: r
                .map((c) => `${textOf(c.first())}: ${textOf(c.eq(j + 1))}`)
                .join("; "),
            },
          },
          null,
        );
      }
      break;
    }
    case "serverir":
      $(".isotope-item:not(.title)").each((i, e) => {
        const c = $(e),
          v = c
            .children("span.item-data")
            .map((i, e) => textOf($(e)))
            .get();
        if (v.length !== 7 || !/^ir[a-z]/.test(v[0])) return;
        const s = textOf(c),
          name = c.children(".item-data").first().text().trim(),
          traffic = v[4],
          payg = traffic.includes("براساس مصرف");
        const tariff = JSON.parse(
          c.find(".price[data-price]").attr("data-price") || "{}",
        );
        if (!tariff.month) throw Error("تعرفهٔ ماهانهٔ سرور.آی‌آر مشخص نیست");
        const monthlyPrice = money(textOf(load(tariff.month)("body")));
        add(
          {
            id: "serverir-" + name,
            name,
            type: "vps",
            cpu: number(v[1]),
            ram: gb(v[2]),
            disk: gb(v[3]),
            trafficGB: payg
              ? 0
              : traffic.includes("نامحدود") && !traffic.includes("دانلود")
                ? null
                : capture(traffic, /دانلود\s*(\d+)\s*gb/),
            trafficUnlimited: traffic === "نامحدود",
            trafficRate: payg
              ? capture(s, /هر گیگابایت دانلود\s*([\d,]+)\s*تومان/)
              : null,
            price: monthlyPrice,
            checkoutUrl: link(c.find("a[href]").first().attr("href"), source),
            notes: [
              s.includes("8mbps")
                ? "دانلود نامحدود با سقف سرعت ۸ مگابیت بر ثانیه است."
                : "آپلود نامحدود است؛ سهمیه و هزینهٔ دانلود جداگانه محاسبه می‌شود.",
              "منابع برابر لزوماً به معنی نوع پردازنده، دیسک یا سرعت شبکهٔ برابر نیست.",
            ],
          },
          c,
        );
      });
      break;
    case "iranhost":
      $(".plan-card").each((i, e) => {
        const c = $(e),
          name = c.find(".card-code").text().trim();
        if (!/^IR-VPS-/.test(name)) return;
        const s = textOf(c.find(".plan-desc")),
          priceText = textOf(c.find(".card-price-large .card-price"));
        if (!textOf(c.find(".card-price-large")).includes("1 ساله"))
          throw Error("دورهٔ ایران‌هاست قابل تأیید نیست");
        const trafficMatch = s.match(/ترافیک ماهیانه\s*([\d.]+\s*[tg]b)/);
        add(
          {
            id: "iranhost-" + name,
            name,
            type: "vps",
            cpu: capture(s, /(\d+)\s*cpu\s*core/),
            ram: capture(s, /(\d+)\s*gb\s*ram/),
            disk: capture(s, /(\d+)\s*gb\s*nvme/),
            diskType: "NVMe",
            trafficGB: trafficMatch ? gb(trafficMatch[1]) : null,
            price: money(priceText + " تومان"),
            period: 12,
            checkoutUrl: source.url,
            notes: [
              "قیمت منتشرشده به میلیون تومان گرد شده و معادل ماهانه در پرداخت یک‌ساله است. مبلغ نهایی باید در پنل فروشنده تأیید شود.",
              "سهمیهٔ ترافیک از جزئیات خود پلن گرفته شده است.",
            ],
          },
          c,
        );
      });
      break;
    case "mizbanfa":
      $(".fusion-title-heading")
        .filter(
          (i, e) =>
            /^پلن (?!های)/.test($(e).text().trim()) &&
            /تومان\s*\/\s*ماهانه/.test(
              textOf($(e).closest(".fusion-column-wrapper")),
            ),
        )
        .each((i, e) => {
          const c = $(e).closest(".fusion-column-wrapper"),
            s = textOf(c),
            name = $(e).text().trim();
          add(
            {
              id:
                "mizbanfa-" +
                name.replace(/\s+/g, "-") +
                "-" +
                (s.includes("germany") ? "eu" : "ir"),
              name,
              region: s.includes("germany") ? "eu" : "ir",
              type: "hosting",
              cpu: capture(s, /(\d+)\s*هسته پردازنده/),
              ram: capture(s, /(\d+)\s*گیگابایت رم/),
              disk: capture(s, /(\d+)\s*گیگابایت فضا/),
              diskType: "NVMe",
              trafficUnlimited: true,
              ipMonthly: 0,
              price: money(
                s.match(/بستن\s*([\d,]+\s*(?:هزار )?تومان)/)?.[1] ||
                  s.match(/([\d,]+\s*(?:هزار )?تومان)\s*\/\s*ماهانه/)?.[1] ||
                  "",
              ),
              checkoutUrl: link(
                c
                  .find("a[href]")
                  .filter((i, e) => $(e).text().includes("خرید این پلن"))
                  .first()
                  .attr("href"),
                source,
              ),
              notes: [
                "منابع هاست اشتراکی هستند؛ هر هسته در صفحه معادل ۱ گیگاهرتز معرفی شده است.",
                "نامحدود، عبارت فروشنده برای ترافیک است؛ محدودیت‌های استفاده را پیش از خرید بررسی کن.",
              ],
            },
            c,
          );
        });
      break;
    case "azaronline":
      $(".plan").each((i, e) => {
        const c = $(e),
          name = c.find(".plan-title").text().trim(),
          s = textOf(c);
        if (!/^سرور مجازی (لینوکس|ویندوز) ایران \d+/.test(name)) return;
        if (!s.includes("در صورت خرید سالانه"))
          throw Error("دورهٔ آذرآنلاین تغییر کرد");
        add(
          {
            id: "azaronline-" + name.replace(/\s+/g, "-"),
            name,
            type: "vps",
            cpu: capture(s, /پردازنده\s*(\d+)\s*هسته/),
            ram: capture(s, /رم\s*(\d+)\s*مگابایت/) / 1024,
            disk: capture(s, /هارد\s*(\d+)\s*گیگابایت/),
            trafficGB: capture(s, /ترافیک ماهانه\s*(\d+)\s*گیگابایت/),
            ipMonthly: 0,
            price: money(s),
            period: 12,
            checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
            notes: [
              "قیمت ماهانهٔ نمایش‌داده‌شده فقط در خرید سالانه معتبر است.",
              "RAM با مبنای ۱۰۲۴ از مگابایت تبدیل شده است.",
            ],
          },
          c,
        );
      });
      break;
    case "bertina": {
      let items = [];
      $('script[type="application/ld+json"]').each((i, e) => {
        try {
          const d = JSON.parse($(e).text());
          if (d["@type"] === "ItemList")
            items = d.itemListElement.map((x) => x.item);
        } catch {}
      });
      for (const item of items) {
        const n = item.name.match(/IRVDS\s*-?\s*(\d+)/)?.[1];
        if (!n) continue;
        const leaf = $("span")
          .filter(
            (i, e) =>
              $(e).children().length === 0 &&
              $(e).text().trim() === "IRVDS-" + n,
          )
          .first();
        let c = leaf;
        for (let j = 0; j < 5 && !textOf(c).includes("monthly traffic"); j++)
          c = c.parent();
        const s = textOf(c);
        if (item.offers?.priceCurrency !== "IRR")
          throw Error("واحد قیمت برتینا تغییر کرد");
        add(
          {
            id: "bertina-IRVDS-" + n,
            name: "IRVDS-" + n,
            type: "vps",
            cpu: capture(s, /cpu\s*(\d+)\s*core/),
            ram: capture(s, /ram\s*(\d+)\s*gb/),
            disk: capture(s, /storage\s*(\d+)\s*gb/),
            diskType: "SSD/NVMe",
            trafficGB: capture(s, /monthly traffic\s*(\d+)\s*gb/),
            ipMonthly: 0,
            price: Number(item.offers.price) / 10,
            checkoutUrl: link(item.offers.url, source),
            notes: [
              "قیمت دقیق ریالی از دادهٔ ساختاریافتهٔ رسمی به تومان تبدیل شده است. تخفیف سالانه در این قیمت لحاظ نشده است.",
            ],
          },
          c,
        );
      }
      break;
    }
    case "onlineserver":
      $("article")
        .filter((i, e) => $(e).find('h3[class*="planName"]').length > 0)
        .each((i, e) => {
          const c = $(e),
            s = textOf(c),
            name = c.find("h3").text().trim();
          if (!s.includes("تومان / ماهانه"))
            throw Error("دورهٔ آنلاین سرور تغییر کرد");
          add(
            {
              id: "onlineserver-" + name.replace(/\s+/g, "-"),
              name,
              type: "vps",
              cpu: capture(s, /پردازنده\s*(\d+)\s*v\s*core/),
              ram: capture(s, /رم\s*(\d+)\s*gb/),
              disk: capture(s, /فضای دیسک\s*(\d+)\s*gb/),
              diskType: "SATA",
              trafficGB: capture(s, /ترافیک ماهانه\s*(\d+)\s*gb/),
              price: money(s),
              checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
            },
            c,
          );
        });
      break;
    case "hidata":
      $(".plan").each((i, e) => {
        const c = $(e),
          name = c.find(".title").text().trim(),
          s = textOf(c);
        if (!/^IR-NVMe-\d+GB$/.test(name)) return;
        add(
          {
            id: "hidata-" + name,
            name,
            type: "vps",
            cpu: capture(s, /پردازنده\s*(\d+)\s*هسته/),
            ram: capture(s, /رم\s*(\d+)\s*gb/),
            disk: capture(s, /فضا\s*(\d+)\s*gb/),
            diskType: "NVMe",
            trafficGB: capture(s, /ترافیک ماهانه\s*(\d+)\s*gb/),
            ipMonthly: 0,
            price: number(c.find(".price-num.m1").text()),
            checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
          },
          c,
        );
      });
      break;
    case "afagh":
      $("#plans-iran .plan-card").each((i, e) => {
        const c = $(e),
          s = textOf(c),
          name = c.find("p").first().text().trim(),
          size = s.match(
            /مقدار فضا\s*:\s*([\d.]+\s*(?:مگابایت|گیگابایت))/,
          )?.[1];
        if (!/تومان\s*سال/.test(s)) throw Error("دورهٔ آفاق هاست تغییر کرد");
        const amount = money(s);
        add(
          {
            id: "afagh-" + name.replace(/\s+/g, "-"),
            name,
            type: "hosting",
            disk: gb(size || ""),
            trafficUnlimited: true,
            ipMonthly: 0,
            price: amount / 12,
            upfront: amount,
            period: 12,
            checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
            notes: [
              "قیمت منتشرشده برای یک سال است؛ قیمت دوره‌های کوتاه‌تر در صفحه درج نشده است. RAM نامحدود به مقدار تضمین‌شده تبدیل نشده است.",
            ],
          },
          c,
        );
      });
      break;
    case "webdade":
      $(".whmpress_price").each((i, e) => {
        let c = $(e);
        for (let j = 0; j < 7 && !/\d+\s*هسته/.test(textOf(c)); j++)
          c = c.parent();
        const s = textOf(c);
        if (!/^(standard|g11)/.test(s) || !c.find("a[href]").length) return;
        const cpu = capture(s, /(\d+)\s*هسته/),
          sizes = [...s.matchAll(/(\d+)\s*گیگ/g)].map((m) => Number(m[1]));
        if (sizes.length !== 2) return;
        const header = s.split(/\d[\d,]+\s*سفارش/)[0].trim(),
          name = header.replace(/^(standard|g11 نسل جدید 2026)\s*/, "").trim();
        add(
          {
            id: `webdade-${/^standard/.test(s) ? "std" : "g11"}-${cpu}-${sizes.join("-")}`,
            name,
            type: "vps",
            cpu,
            ram: sizes[0],
            disk: sizes[1],
            diskType: /nvme/.test(s)
              ? "NVMe"
              : /sas/.test(s)
                ? "SAS"
                : "نامشخص",
            trafficGB: 0,
            trafficRate: 1000,
            price: number($(e).text()),
            checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
            notes: [
              "اطلاعیهٔ فعلی صفحه، کل ترافیک دانلود را به ازای هر ترابایت یک میلیون تومان محاسبه می‌کند؛ آپلود رایگان است.",
              "عبارت ۱۰۰GB در جدول با اطلاعیهٔ PAYG سازگار نیست؛ سهمیهٔ رایگان در برآورد لحاظ نشده است.",
            ],
          },
          c,
        );
      });
      break;
    case "talahost": {
      const t = $(".pt-table").first(),
        r = rows(t),
        headers = t.find("thead th").slice(1);
      headers.each((j, e) => {
        let amount, period;
        for (const [label, p] of [
          ["قیمت سه ماهه", 3],
          ["قیمت شش ماهه", 6],
          ["قیمت یکساله", 12],
        ]) {
          const v = number(val(r, label, j));
          if (v) {
            amount = v;
            period = p;
            break;
          }
        }
        const disk = number(val(r, "فضا (مگابایت)", j)) / 1000;
        add(
          {
            id: "talahost-" + disk,
            name: $(e).text().trim(),
            type: "hosting",
            disk,
            ram: number(val(r, "ram فیزیکی", j)) / 1000,
            trafficGB: number(val(r, "پهنای باند", j)) / 1000,
            ipMonthly: 0,
            price: amount / period,
            upfront: amount,
            period,
            checkoutUrl: link($(e).find("a").attr("href"), source),
            notes: [
              "CPU در منبع با سقف ۳۰۰۰ مگاهرتز معرفی شده و به تعداد هسته تبدیل نشده است.",
              "کوتاه‌ترین دورهٔ دارای قیمت انتخاب شده است. فضای MB با مبنای ۱۰۰۰ به GB تبدیل شده است.",
            ],
            evidence: {
              text: r
                .map((c) => `${textOf(c.first())}: ${textOf(c.eq(j + 1))}`)
                .join("; "),
            },
          },
          null,
        );
      });
      break;
    }
    case "hostnegar":
      $("h3")
        .filter((i, e) => /^هاست ایران P\d+$/.test($(e).text().trim()))
        .each((i, e) => {
          const c = $(e).parent().parent(),
            s = textOf(c),
            name = $(e).text().trim(),
            amount = capture(s, /3 ماهه\s*([\d,٬،]+)\s*ریال/) / 10,
            size = s.match(/میزان فضا\s*([\d.]+\s*(?:mb|gb))/)?.[1];
          add(
            {
              id: "hostnegar-" + name.match(/P\d+/)[0],
              name,
              type: "hosting",
              disk: gb(size || ""),
              diskType: "NVMe",
              trafficUnlimited: true,
              ipMonthly: 0,
              price: amount / 3,
              upfront: amount,
              period: 3,
              checkoutUrl: link(c.find("a[href]").last().attr("href"), source),
              notes: [
                "مبلغ ریالی دورهٔ سه‌ماهه به تومان و معادل ماهانه تبدیل شده است.",
              ],
            },
            c,
          );
        });
      break;
    case "mihanhosting": {
      const t = $("table")
          .filter((i, e) => textOf($(e)).includes("قیمت ماهانه"))
          .first(),
        r = rows(t),
        names = t.find("thead th").slice(1),
        priceRow = field(r, "قیمت ماهانه");
      names.each((j, e) => {
        const script = priceRow
            ?.eq(j + 1)
            .find("script")
            .attr("src"),
          raw = aux[script];
        if (!raw) throw Error("فید قیمت دریافت نشد");
        const value = raw.match(
          /^\s*document\.write\(['"]([^'"<>]+)['"]\);?\s*$/,
        )?.[1];
        if (!value) throw Error("فید قیمت قابل استخراج نیست");
        const pid = new URL(script).searchParams.get("pid");
        add(
          {
            id: "mihanhosting-" + pid,
            name: $(e).text().trim(),
            type: "hosting",
            disk: gb(val(r, "فضا", j)),
            diskType: "NVMe",
            region: "unknown",
            trafficGB: gb(val(r, "ترافیک ماهیانه", j)),
            ipMonthly: 0,
            price: money(value),
            checkoutUrl: source.url,
            notes: [
              "منبع محل سرویس را «اروپا – ایران» اعلام کرده؛ قیمت مستقل هر موقعیت تفکیک نشده است.",
              "CPU و RAM مشخص نشده‌اند. قیمت ماهانه از فید رسمی همان شناسهٔ محصول گرفته شده است.",
            ],
            evidence: {
              text: r
                .map((c) => `${textOf(c.first())}: ${textOf(c.eq(j + 1))}`)
                .join("; "),
              priceFeed: script,
              priceText: value,
              feedHash: createHash("sha256").update(raw).digest("hex"),
            },
          },
          null,
        );
      });
      break;
    }
    case "mehrhost":
      $("table.comparision-table").each((ti, table) => {
        const t = $(table),
          r = rows(t),
          names = t.find("thead th").slice(1);
        names.each((j, e) => {
          const monthly = money(val(r, "قیمت ماهانه", j)),
            annual = money(val(r, "قیمت سالانه", j)),
            period = monthly ? 1 : 12,
            amount = monthly || annual;
          for (const [region, label] of [
            ["ir", "ثبت سفارش ( سرور ایران )"],
            ["eu", "ثبت سفارش ( سرور آلمان )"],
          ]) {
            const order = field(r, label)
              ?.eq(j + 1)
              .find("a[href]");
            if (!order?.length) continue;
            const name = $(e).text().trim(),
              traffic = val(r, "ترافیک ماهانه", j);
            add(
              {
                id: `mehrhost-${name.replace(/\s+/g, "-")}-${region}`,
                name,
                type: "hosting",
                region,
                cpu: number(val(r, "مقدار پردازنده", j)),
                ram: gb(val(r, "مقدار رم", j)),
                disk: gb(val(r, "فضای میزبانی", j)),
                diskType: "SSD",
                trafficGB: gb(traffic),
                trafficUnlimited: traffic.includes("نامحدود"),
                ipMonthly: 0,
                price: amount / period,
                upfront: amount,
                period,
                checkoutUrl: link(order.attr("href"), source),
                notes: [
                  "منابع اعلام‌شده مربوط به هاست هستند. کد تخفیف و تبلیغات جشنواره در قیمت لحاظ نشده‌اند.",
                  "کوتاه‌ترین دورهٔ دارای تعرفه انتخاب شده است.",
                ],
                evidence: {
                  text: r
                    .map((c) => `${textOf(c.first())}: ${textOf(c.eq(j + 1))}`)
                    .join("; "),
                },
              },
              null,
            );
          }
        });
      });
      break;
    default:
      throw Error("استخراج‌گر این منبع تعریف نشده است");
  }
  return finish(source, stamp, result);
}

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore } from "../server/store.mjs";
import { providers, sources } from "../server/catalog.mjs";
import { catalogDocument, catalogCSV } from "../server/export.mjs";
const store = createStore(),
  offers = store.offers(),
  document = catalogDocument(offers, providers, sources, store.status());
const jsonPath = resolve("../hosting-data.json"),
  csvPath = resolve("../hosting-data.csv");
writeFileSync(jsonPath, JSON.stringify(document, null, 2));
writeFileSync(csvPath, catalogCSV(offers, providers));
const table = providers
  .map((p) => {
    const list = offers.filter((o) => o.providerId === p.id),
      urls = sources
        .filter((s) => s.providerId === p.id)
        .map((s) => `[صفحهٔ رسمی](${s.url})`)
        .join(" · ");
    return `| ${p.name} | ${list.length} | ${urls} |`;
  })
  .join("\n");
writeFileSync(
  resolve("../hosting-sources.md"),
  `# داده‌های هاست و سرور ابرگزین\n\n${document.providerCount} فروشنده، ${document.offerCount} پلن یا پیکربندی. مبالغ به تومان‌اند. زمان تأیید هر ردیف در داده‌ها ثبت شده است؛ زمان خروجی جای تاریخ تأیید تعرفه را نمی‌گیرد.\n\n| فروشنده | پلن / پیکربندی | منبع |\n| --- | ---: | --- |\n${table}\n\n۱۲ پیکربندی آروان از تعرفهٔ واحد منابع محاسبه شده‌اند. باقی ردیف‌ها از پلن‌های منتشرشده استخراج شده‌اند. قیمت ماهانهٔ بعضی پلن‌ها معادل پرداخت سه‌ماهه، شش‌ماهه یا سالانه است؛ دوره و مبلغ پایهٔ پرداخت در CSV و JSON مشخص‌اند. مقدار خالی CSV یا null در JSON یعنی در منبع مشخص نشده، نه صفر.\n\nاطلاعیهٔ PAYG وب‌داده با عبارت ۱۰۰GB جدول ناسازگار است؛ برای احتیاط کل دانلود با تعرفهٔ منتشرشده محاسبه می‌شود. قیمت ایران‌هاست در صفحه به میلیون تومان گرد شده است. میهن هاستینگ قیمت را از فید عمومی همان محصول می‌گیرد و ایران/اروپا را در آن قیمت تفکیک نکرده است. این موارد در notes هر ردیف هم ثبت شده‌اند.\n\nمنابع هر شش ساعت و با دکمهٔ بررسی دوباره در برنامه دریافت می‌شوند. شکست دریافت یا تغییر ساختار، تعرفه و تاریخ تأیید قبلی را حفظ می‌کند؛ موجودی لحظه‌ای و قیمت نهایی سبد خرید تضمین نمی‌شود.\n`,
);
console.log(
  JSON.stringify({
    providers: document.providerCount,
    offers: document.offerCount,
    jsonPath,
    csvPath,
  }),
);
store.db.close();

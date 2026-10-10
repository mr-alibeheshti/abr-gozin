export function catalogDocument(offers, providers, sources, status = []) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    currency: "تومان",
    providerCount: new Set(offers.map((o) => o.providerId)).size,
    offerCount: offers.length,
    methodology: [
      "دادهٔ واقعی از صفحات رسمی فروشندگان؛ تاریخ exportedAt زمان خروجی است و تاریخ verifiedAt زمان تأیید هر تعرفه.",
      "price تعرفهٔ پایهٔ معادل ماهانه است. period تعداد ماه‌های دورهٔ همان تعرفه و upfront مبلغ پایهٔ دوره در صورت انتشار است.",
      "قیمت‌های سالانه و سه‌ماهه به معادل ماهانه تبدیل شده‌اند؛ این به معنی امکان پرداخت ماهانه نیست.",
      "مالیات، IPv4 و ترافیک مازاد فقط در صورت داشتن تعرفهٔ مشخص قابل محاسبه‌اند؛ null به معنی نامشخص است.",
      "منابع با ظرفیت اسمی مقایسه می‌شوند؛ کیفیت، اشتراک CPU، نوع دیسک و مدیریت یکسان فرض نشده‌اند.",
      "پیکربندی‌های custom آروان از تعرفهٔ واحد محاسبه شده‌اند؛ سایر ردیف‌ها پلن‌های منتشرشده‌اند.",
    ],
    providers,
    sources,
    status,
    offers,
  };
}
const cell = (value) => {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function catalogCSV(offers, providers) {
  const names = new Map(providers.map((p) => [p.id, p.name]));
  const headers = [
    "provider",
    "provider_id",
    "plan",
    "service",
    "region",
    "cpu_cores",
    "ram_gb",
    "disk_gb",
    "disk_type",
    "base_monthly_toman",
    "billing_period_months",
    "base_upfront_toman",
    "included_traffic_gb",
    "unlimited_traffic_claim",
    "extra_traffic_toman_per_gb",
    "ipv4_monthly_toman",
    "vat_rate",
    "calculated_configuration",
    "verified_at",
    "source_url",
    "order_url",
    "notes",
  ];
  const rows = offers.map((o) => [
    names.get(o.providerId),
    o.providerId,
    o.name,
    o.type,
    o.region,
    o.cpu,
    o.ram,
    o.disk,
    o.diskType,
    o.price,
    o.period,
    o.upfront ?? o.price * o.period,
    o.trafficGB,
    o.trafficUnlimited ?? false,
    o.trafficRate,
    o.ipMonthly,
    o.vatRate,
    o.custom,
    o.verifiedAt,
    o.url,
    o.checkoutUrl,
    o.notes.join(" | "),
  ]);
  return (
    "\ufeff" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") +
    "\r\n"
  );
}

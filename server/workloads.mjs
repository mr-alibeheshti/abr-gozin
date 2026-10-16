// Reviewed 2026-10-16. Software requirements and Abrgozin's initial sizing
// policy are distinct. These floors are a shortlist policy, not a load test.
export const sizingRevision = "2026-10-16";
export const workloadTypes = {
  docker: "vps",
  backend: "vps",
  python: "vps",
  database: "vps",
  wordpress: "hosting",
  website: "hosting",
};
const reference = (name, url, finding) => ({
  name,
  url,
  finding,
  reviewedAt: sizingRevision,
});
const wordpress = reference(
  "نیازمندی‌های WordPress",
  "https://wordpress.org/about/requirements/",
  "PHP 8.3+، MySQL 8.0+ یا MariaDB 10.11+ و HTTPS؛ این صفحه حد ثابت دیسک اعلام نمی‌کند.",
);
const php = reference(
  "راهنمای میزبانی WordPress",
  "https://make.wordpress.org/hosting/handbook/server-environment/#php-memory-limit",
  "حافظهٔ PHP: پیشنهاد معمول 256MB و برای کار سنگین 512MB یا بیشتر؛ این محدودیت با RAM کل هاست یکسان نیست.",
);
const woo = reference(
  "نیازمندی‌های WooCommerce",
  "https://woocommerce.com/document/server-requirements/",
  "WordPress memory limit دست‌کم 256MB؛ نیاز واقعی با افزونه‌ها، محصولات و بار فروشگاه تغییر می‌کند.",
);
const media = reference(
  "تصاویر محصولات WooCommerce",
  "https://woocommerce.com/document/adding-product-images-and-galleries/",
  "تصویر اصلی، کاتالوگ و بندانگشتی فضا می‌گیرند؛ تعداد محصول به‌تنهایی حجم دیسک را تعیین نمی‌کند.",
);
const ubuntu = reference(
  "نیازمندی‌های Ubuntu Server",
  "https://ubuntu.com/server/docs/reference/installation/system-requirements/",
  "برای Ubuntu 24.04 amd64 cloud: حد نصب 1GB RAM و 4GB دیسک؛ فضای پیشنهادی 25GB یا بیشتر. منابع برنامه جداست.",
);
const docker = reference(
  "منابع کانتینر در Docker Engine",
  "https://docs.docker.com/engine/containers/resource_constraints/",
  "منابع به سرویس‌های داخل کانتینر وابسته است؛ مصرف واقعی باید اندازه‌گیری و محدود شود. نیاز Docker Desktop به سرور تعمیم داده نمی‌شود.",
);
const node = reference(
  "اندازه‌گیری حافظه در Node.js",
  "https://nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory",
  "heap تنها بخشی از مصرف فرایند است؛ مصرف برنامه و workerها باید اندازه‌گیری شود.",
);
const django = reference(
  "چک‌لیست استقرار Django",
  "https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/",
  "فایل‌های media، دیتابیس، کش و محیط production باید جداگانه بررسی شوند؛ رم ثابت برای همهٔ پروژه‌ها اعلام نشده است.",
);
const python = reference(
  "اندازه‌گیری حافظه در Python",
  "https://docs.python.org/3/library/tracemalloc.html",
  "نیاز حافظهٔ برنامه را باید اندازه گرفت؛ نام Python به‌تنهایی ظرفیت سرور را تعیین نمی‌کند.",
);
const postgres = reference(
  "منابع PostgreSQL",
  "https://www.postgresql.org/docs/current/runtime-config-resource.html",
  "حافظه به shared_buffers، اتصال‌ها و عملیات هم‌زمان بستگی دارد؛ اندازهٔ دیتابیس به‌تنهایی RAM لازم را تعیین نمی‌کند.",
);
const mysql = reference(
  "مصرف حافظهٔ MySQL",
  "https://dev.mysql.com/doc/refman/8.4/en/memory-use.html",
  "بافرهای مشترک و مصرف هر اتصال در حافظهٔ کل مؤثرند.",
);
const redis = reference(
  "حافظهٔ Redis",
  "https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/",
  "حجم داده، سربار ساختارها و عملیات روی داده در مصرف حافظه مؤثر است.",
);
const storageQuestion = "حجم، رشد و بکاپ فایل‌ها چقدر است؟";
const loadQuestion = "بازدید یا کاربران هم‌زمان چقدر است؟";
export const workloadGuide = [
  {
    id: "wordpress",
    name: "سایت وردپرسی",
    type: "hosting",
    minimum: { disk: 5, ram: 1 },
    rationale:
      "کف شروع ابرگزین برای نصب، افزونه، به‌روزرسانی و کمی محتوا: 5GB دیسک و 1GB RAM. این اعداد حداقل رسمی WordPress نیستند؛ حجم واقعی و بار سایت می‌تواند بیشتر باشد.",
    checks: [
      "نسخهٔ PHP و MySQL/MariaDB، HTTPS و حافظهٔ PHP را از میزبان تأیید کن؛ RAM پلن، memory_limit PHP را ثابت نمی‌کند.",
      "برای سایت انتقالی، حجم واقعی فایل‌ها و دیتابیس را از ابزار سلامت سایت یا کنترل‌پنل بگیر.",
    ],
    sources: [wordpress, php],
    scenarios: [
      { id: "blog", name: "بلاگ و محتوایی" },
      {
        id: "store",
        name: "فروشگاه با WooCommerce",
        minimum: { disk: 10, ram: 2 },
        policy: "کف شروع ابرگزین؛ حداقل رسمی نرم‌افزار یا تضمین عملکرد نیست.",
        sources: [woo, media],
      },
      { id: "business", name: "شرکتی و معرفی خدمات" },
    ],
    questions: {
      purpose: "سایتت فروشگاهی، خبری/بلاگ یا شرکتی است؟",
      quantity: "چند محصول و تصویر داری؟",
      storage: storageQuestion,
      load: loadQuestion,
      features: "چه افزونه یا نیاز ویژه‌ای داری؟",
    },
  },
  {
    id: "website",
    name: "وب‌سایت و میزبانی وب",
    type: "hosting",
    minimum: { disk: 0, ram: 0 },
    rationale:
      "برای سایت کاملاً استاتیک، حجم واقعی فایل‌ها معیار است و چند گیگابایت حد اجباری نیست. برای سایت پویا، نیاز نرم‌افزار و داده باید مشخص شود.",
    checks: [
      "هاست اشتراکی لزوماً اجرای Node.js، Python یا فرایند دائمی را پشتیبانی نمی‌کند؛ پشتیبانی runtime را تأیید کن.",
    ],
    sources: [django, wordpress],
    scenarios: [
      { id: "static", name: "استاتیک؛ HTML/CSS/JS" },
      { id: "dynamic", name: "پویا؛ PHP و دیتابیس" },
    ],
    questions: {
      purpose: "با چه زبان یا سیستمی ساخته شده؟",
      quantity: "چند صفحه، تصویر و فایل داری؟",
      storage: storageQuestion,
      load: loadQuestion,
      features: "فرم، ورود کاربر یا نیاز خاصی داری؟",
    },
  },
  {
    id: "docker",
    name: "داکر و کانتینر",
    type: "vps",
    minimum: { disk: 25, ram: 1 },
    rationale:
      "پایهٔ شروع برای سرور Linux با فرض Ubuntu cloud: 1GB RAM و 25GB دیسک. این فقط کف انتخاب است؛ مصرف کانتینرها، imageها، build cache و volumeها جداگانه لازم است.",
    checks: [
      "دسترسی لازم برای Docker، معماری CPU و محدودیت منابع هر کانتینر باید تأیید شود.",
    ],
    sources: [ubuntu, docker],
    scenarios: [
      { id: "single", name: "یک سرویس ساده" },
      { id: "stack", name: "چند سرویس / Compose" },
    ],
    questions: {
      purpose: "چه سرویس‌هایی با Docker اجرا می‌کنی؟",
      quantity: "چند کانتینر، دیتابیس و کش داری؟",
      storage: "حجم imageها، volumeها و بکاپ چقدر است؟",
      load: loadQuestion,
      features: "build، worker یا دسترسی خاص لازم داری؟",
    },
  },
  {
    id: "backend",
    name: "بک‌اند؛ Node.js یا Django",
    type: "vps",
    minimum: { disk: 25, ram: 1 },
    rationale:
      "پایهٔ سرور Linux با فرض Ubuntu cloud: 1GB RAM و 25GB دیسک؛ این مقدار تضمین اجرای پروژه نیست. worker، دیتابیس، کش، آپلودها و بار API باید جدا سنجیده شوند.",
    checks: [
      "نسخهٔ runtime، فرایندهای دائمی، دسترسی نصب و برنامهٔ backup را بررسی کن.",
    ],
    sources: [ubuntu, node, django],
    scenarios: [
      { id: "node", name: "Node.js" },
      { id: "django", name: "Django" },
      { id: "other", name: "فریم‌ورک دیگر" },
    ],
    questions: {
      purpose: "زبان، فریم‌ورک و نسخهٔ بک‌اند چیست؟",
      quantity: "چند برنامه، worker و دیتابیس داری؟",
      storage: storageQuestion,
      load: "چند درخواست یا کاربر هم‌زمان داری؟",
      features: "آپلود، WebSocket، صف یا cron لازم داری؟",
    },
  },
  {
    id: "python",
    name: "برنامه یا ربات پایتون",
    type: "vps",
    minimum: { disk: 25, ram: 1 },
    rationale:
      "پایهٔ Linux با فرض Ubuntu cloud: 1GB RAM و 25GB دیسک. ربات سبک، مرورگر خودکار و مدل یادگیری ماشین مصرف یکسانی ندارند؛ نیاز برنامه باید اندازه‌گیری شود.",
    checks: [
      "نسخهٔ Python، کتابخانه‌های سیستمی، اجرای دائمی یا زمان‌بندی و هر نیاز GPU باید تأیید شود.",
    ],
    sources: [ubuntu, python],
    scenarios: [
      { id: "bot", name: "ربات / وب‌اپ / کار زمان‌بندی‌شده" },
      { id: "data", name: "پردازش داده" },
      { id: "ml", name: "یادگیری ماشین و مدل AI" },
    ],
    questions: {
      purpose: "ربات، وب‌اپ، پردازش داده یا مدل AI؟",
      quantity: "چند فرایند داری و زمان هر کار چقدر است؟",
      storage: "حجم دیتاست، مدل و بکاپ چقدر است؟",
      load: "چند کار هم‌زمان و با چه زمان‌بندی داری؟",
      features: "چه کتابخانه، GPU یا دسترسی خاصی لازم داری؟",
    },
  },
  {
    id: "database",
    name: "پایگاه دادهٔ مستقل",
    type: "vps",
    minimum: { disk: 25, ram: 1 },
    rationale:
      "پایهٔ Linux با فرض Ubuntu cloud: 1GB RAM و 25GB دیسک؛ حجم داده، رشد، index، log و بکاپ به این پایه اضافه می‌شوند. این کف ظرفیت عملیاتی دیتابیس را تضمین نمی‌کند.",
    checks: [
      "موتور و نسخه، SSD/IOPS، پایداری، backup و replication را بررسی کن؛ برای Redis اندازهٔ داده در حافظه و سربار آن مهم است.",
    ],
    sources: [ubuntu, postgres, mysql, redis],
    scenarios: [
      { id: "postgres", name: "PostgreSQL" },
      { id: "mysql", name: "MySQL / MariaDB" },
      { id: "redis", name: "Redis" },
      { id: "other", name: "موتور دیگر" },
    ],
    questions: {
      purpose: "نوع و نسخهٔ دیتابیس چیست؟",
      quantity: "حجم داده و indexهای فعلی چقدر است؟",
      storage: "رشد داده، log و بکاپ چقدر است؟",
      load: "تعداد اتصال و نسبت خواندن/نوشتن چقدر است؟",
      features: "replica، بازیابی یا persistence لازم داری؟",
    },
  },
];
export const scenarioIds = [
  ...new Set(workloadGuide.flatMap((w) => w.scenarios.map((s) => s.id))),
];
export const needKeys = ["purpose", "quantity", "storage", "load", "features"];
export const emptyNeeds = () =>
  Object.fromEntries(needKeys.map((k) => [k, null]));
export function validScenario(workload, scenario) {
  return (
    !scenario ||
    scenario === "general" ||
    Boolean(
      workloadGuide
        .find((w) => w.id === workload)
        ?.scenarios.some((s) => s.id === scenario),
    )
  );
}
export function allowsWorkload(type, workload) {
  if (!type || type === "all" || !workloadTypes[workload]) return true;
  if (workloadTypes[workload] === "hosting")
    return ["hosting", "vps", "dedicated"].includes(type);
  return ["vps", "dedicated"].includes(type);
}
export function requirementsFor(p = {}) {
  const guide = workloadGuide.find((w) => w.id === p.workload);
  const scenario = p.scenario || "general";
  const store = guide?.id === "wordpress" && scenario === "store";
  const minimum = { disk: 0, ram: 0, cpu: 0, ...guide?.minimum };
  const sources = [...(guide?.sources || [])];
  const checks = [...(guide?.checks || [])];
  let rationale =
    guide?.rationale ||
    "ابتدا کاربرد را مشخص کن؛ از نام سرویس به‌تنهایی نمی‌توان منابع لازم پروژه را نتیجه گرفت.";
  if (store) {
    minimum.disk = 10;
    minimum.ram = 2;
    sources.push(woo, media);
    rationale =
      "کف شروع ابرگزین برای فروشگاه تازه: 10GB دیسک و 2GB RAM؛ این سیاست اولیه است، نه حداقل رسمی WooCommerce و نه تضمین ظرفیت محصول یا بازدید. حجم تصاویر، دیتابیس، افزونه‌ها و بار پرداخت می‌تواند نیاز را افزایش دهد.";
  }
  if (guide?.id === "website" && scenario === "dynamic") {
    minimum.disk = 5;
    minimum.ram = 1;
    rationale =
      "کف شروع پیشنهادی ابرگزین برای سایت PHP و دیتابیس تازه: 5GB دیسک و 1GB RAM. نیاز واقعی به نرم‌افزار و محتوا بستگی دارد و این حداقل رسمی یک زبان یا فریم‌ورک نیست.";
  }
  if (guide && ["vps", "dedicated"].includes(p.type)) {
    minimum.disk = Math.max(25, minimum.disk);
    minimum.ram = Math.max(1, minimum.ram);
    if (!sources.some((s) => s.url === ubuntu.url)) sources.push(ubuntu);
    checks.push(
      "پایهٔ سیستم‌عامل با فرض Ubuntu 24.04 cloud محاسبه شده؛ سیستم‌عامل دیگر باید جداگانه بررسی شود.",
    );
  }
  const data = Number(p.dataGB) || 0,
    growth = Number(p.growthGB) || 0,
    copies = Number(p.backupCopies) || 0;
  const payload = (data + growth) * (1 + copies);
  const storageFloor = minimum.disk;
  if (payload > 0) minimum.disk = Math.ceil(storageFloor + payload * 1.25);
  for (const key of ["ram", "cpu"])
    minimum[key] = Math.max(
      minimum[key],
      Number(p["min" + key[0].toUpperCase() + key.slice(1)]) || 0,
    );
  minimum.disk = Math.max(minimum.disk, Number(p.minDisk) || 0);
  const conflicts = [];
  for (const key of ["ram", "disk", "cpu"])
    if (
      Number(p[key]) > 0 &&
      Number(p[key]) < minimum[key] &&
      p.resourceMode !== "minimum"
    )
      conflicts.push(
        `${key === "disk" ? "دیسک" : key === "ram" ? "رم" : "پردازنده"} دقیق انتخاب‌شده از کف این کاربرد کمتر است.`,
      );
  const questions = guide
    ? { ...guide.questions }
    : {
        purpose: "چه سایت یا برنامه‌ای می‌خواهی اجرا کنی؟",
      };
  if (store) {
    questions.quantity = "چند محصول، تنوع و عکس برای هر محصول داری؟";
    questions.features = "چه افزونه یا اتصال فروشگاهی لازم داری؟";
  }
  if (guide?.id === "wordpress" && scenario === "business")
    questions.quantity = "چند صفحه، فرم و نمونه‌کار داری؟";
  const blockers =
    p.gpu === true || p.gpu === "true"
      ? [
          "GPU یا VRAM تأییدشده در کاتالوگ فعلی ثبت نشده؛ گزینهٔ سازگار نمی‌توان معرفی کرد.",
        ]
      : [];
  if (guide?.id === "database" && scenario === "redis")
    sources.push(
      reference(
        "اندازه‌گیری حافظهٔ Redis با INFO",
        "https://redis.io/docs/latest/commands/info/",
        "used_memory، used_memory_rss و used_memory_peak مصرف و اوج حافظه را نشان می‌دهند؛ رشد و سربار عملیات هم باید بررسی شوند.",
      ),
    );
  if (
    guide?.id === "database" &&
    scenario === "redis" &&
    !(Number(p.minRam) > 0 || Number(p.ram) > 0)
  ) {
    blockers.push(
      "برای Redis، حافظهٔ لازم را با مصرف واقعی و اوج مصرف (INFO memory) و رشد داده مشخص کن و حداقل رم را وارد کن؛ حجم فایل دیتابیس به‌تنهایی معیار RAM نیست.",
    );
  }
  if (
    guide?.id === "python" &&
    scenario === "ml" &&
    !(Number(p.minRam) > 0 || Number(p.ram) > 0) &&
    !blockers.length
  ) {
    blockers.push(
      "برای اجرای مدل AI ابتدا مدل، روش اجرای CPU/GPU و حافظهٔ لازم طبق مستندات همان مدل یا اندازه‌گیری را مشخص کن و حداقل رم را وارد کن؛ کف عمومی Linux برای مدل توصیه نمی‌شود.",
    );
  }
  return {
    revision: sizingRevision,
    workload: p.workload || "all",
    scenario,
    name: guide?.name || "کاربرد نامشخص",
    minimum,
    rationale,
    calculation:
      payload > 0
        ? {
            baseDisk: storageFloor,
            dataGB: data,
            growthGB: growth,
            backupCopies: copies,
            headroomPercent: 25,
            requiredDisk: minimum.disk,
            explanation:
              "پایه + (داده + رشد) × (۱ + بکاپ محلی) × ۱٫۲۵؛ حاشیهٔ ۲۵٪ سیاست ابرگزین است و جای اندازه‌گیری log/index را نمی‌گیرد.",
          }
        : null,
    checks,
    sources,
    questions,
    conflicts,
    blockers,
    caveat:
      "این فهرست برای بررسی اولیهٔ ظرفیت است؛ عملکرد و سازگاری نرم‌افزاری تأیید نشده و باید با میزبان و آزمون بار بررسی شود.",
  };
}
export function meetsRequirements(offer, r) {
  return (
    !r.blockers.length &&
    Object.entries(r.minimum).every(
      ([key, value]) =>
        value <= 0 || (Number.isFinite(offer[key]) && offer[key] >= value),
    )
  );
}
export function assessNeeds(filters, needs = {}) {
  const requirements = requirementsFor(filters);
  const questions = [];
  if (!workloadTypes[filters.workload])
    questions.push({ key: "purpose", text: requirements.questions.purpose });
  else {
    if (!needs.purpose || !filters.scenario || filters.scenario === "general")
      questions.push({ key: "purpose", text: requirements.questions.purpose });
    for (const key of needKeys.slice(1))
      if (!needs[key])
        questions.push({ key, text: requirements.questions[key] });
    if (filters.maxPrice === null || filters.maxPrice === undefined)
      questions.push({
        key: "budget",
        text: "سقف بودجهٔ ماهانه به تومان چقدر است؟",
      });
  }
  for (const text of requirements.blockers)
    questions.push({ key: "capacity", text });
  return { ready: questions.length === 0, pending: questions, requirements };
}

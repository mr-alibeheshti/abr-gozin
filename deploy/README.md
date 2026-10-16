# استقرار ابرگزین

نشانی این نصب: `https://abeheshti.ir/abrgozin/`. برنامهٔ Node، چت و ورکر در یک کانتینر همیشه‌روشن‌اند. SQLite و مدل محلی در `/var/lib/abrgozin` روی میزبان باقی می‌مانند. کلیدها داخل ایمیج یا گیت قرار نمی‌گیرند.

ساخت روی دستگاه دارای دسترسی به npm و Docker Hub، برای معماری سرور:

```sh
docker build --platform linux/amd64 --build-arg APP_BASE_PATH=/abrgozin -t abrgozin:RELEASE .
```

ایمیج را با `docker save` و SSH به میزبان انتقال بده و با `docker load` وارد کن. در `/opt/abrgozin`، `compose.yaml` و فایل خصوصی `abrgozin.env` با مجوز 600 قرار می‌گیرند. فایل خصوصی فقط تنظیمات Gemini و درگاه آن را دارد؛ پراکسی لوکال دستگاه توسعه منتقل نمی‌شود. مسیر داده باید برای UID/GID 1000 قابل نوشتن باشد.

زیر قفل `/var/lock/nabz-production.lock`، کانتینر همین برنامه را اجرا کن:

```sh
ABRGOZIN_IMAGE=abrgozin:RELEASE docker-compose -p abrgozin -f /opt/abrgozin/compose.yaml up -d
curl -f http://127.0.0.1:4322/abrgozin/api/health
```

پس از سلامت کانتینر، تنظیم `abeheshti.ir.conf` را در فایل مخصوص همین دامنه در volume مربوط به `nginx-proxy` قرار بده؛ تنظیم قبلی را حفظ و پشتیبان بگیر. ابتدا `docker exec nginx-proxy nginx -t` و سپس `docker exec nginx-proxy nginx -s reload` را اجرا کن. مسیرهای دیگر دامنه همچنان به سایت شخصی می‌روند. رکورد DNS و TLS فعلی استفاده می‌شوند.

بررسی نهایی شامل صفحه، فایل‌های JS/CSS/فونت/لوگو، جست‌وجو، ذخیره‌ها، خروجی‌ها، لینک خرید، گفت‌وگوی واقعی و `job.enabled`/`job.nextRunAt` است. در نصب عمومی، بررسی دستی HTTP غیرفعال است؛ اجرای مدیریتی با `docker exec abrgozin node scripts/refresh.mjs` انجام می‌شود. ورکر هر ۷۲ ساعت اجرا می‌شود و برنامهٔ آن با بازسازی کانتینر حفظ می‌شود.

برای بازگشت، ایمیج سالم قبلی را در `ABRGOZIN_IMAGE` قرار بده و فقط کانتینر ابرگزین را جایگزین کن. در اولین نصب، بازگرداندن فایل قبلی vhost و reload، دامنه را به حالت پیشین برمی‌گرداند. داده‌ها و فایل خصوصی را نگه دار. نسخهٔ فعال و آخرین نسخهٔ سالم برای بازگشت حفظ می‌شوند؛ آرشیوهای موقت انتقال پس از تأیید حذف می‌شوند. از prune سراسری روی میزبان مشترک استفاده نکن.

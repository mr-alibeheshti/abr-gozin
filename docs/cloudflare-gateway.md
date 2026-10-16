# اتصال Gemini از Cloudflare AI Gateway

مسیر درخواست: سرور ابرگزین ← Cloudflare AI Gateway ← Gemini.
کلید Gemini و توکن Cloudflare فقط روی سرور قرار می‌گیرند.

## راه‌اندازی

1. در [Cloudflare](https://dash.cloudflare.com/sign-up) حساب بساز و وارد [AI Gateway](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway) شو. یک Gateway با نام `abrgozin` بساز.
2. در Settings همان Gateway، گزینهٔ Authenticated Gateway را فعال کن و با Create authentication token یک توکن دارای مجوز `AI Gateway Run` بساز. توکن را در فایل محلی نگه دار؛ آن را در چت، کد یا Git قرار نده. این مجوز در Cloudflare در سطح حساب است، نه فقط یک Gateway.
3. آدرس provider-native مربوط به Google AI Studio را از Gateway بردار و در `.env` وارد کن:

```dotenv
GEMINI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/abrgozin/google-ai-studio
GEMINI_GATEWAY_TOKEN=YOUR_GATEWAY_RUN_TOKEN
# کلید فعلی Gemini نیز در GEMINI_API_KEY لازم است.
```

4. سرور برنامه را دوباره اجرا کن. پاسخ `/api/chat/status` باید `transport: "cloudflare-ai-gateway"` داشته باشد. `configured` فقط کامل‌بودن تنظیمات را نشان می‌دهد؛ یک پیام واقعی برای بررسی اتصال لازم است.

در این حالت `GEMINI_PROXY_URL` و `GEMINI_BASE_URL` استفاده نمی‌شوند؛ اتصال برنامه مستقیم به Cloudflare است. آدرس ناقص یا بدون توکن، چت را با خطای تنظیمات متوقف می‌کند و به مسیر قبلی برنمی‌گردد. خود سایت همچنان در دسترس است.

## رفتار اتصال

- API و خروجی JSON Gemini حفظ می‌شوند. هیچ آدرس یا کلیدی به مرورگر داده نمی‌شود.
- در تست زنده، درگاه کلید Google را از هدر نپذیرفت (خطای 2044). در مسیر Cloudflare کلید فقط در درخواست HTTPS سمت سرور، با پارامتر `key` ارسال می‌شود. آدرس کامل درخواست و بدنهٔ خطاها ثبت نمی‌شوند؛ در مسیر مستقیم همچنان هدر `x-goog-api-key` استفاده می‌شود.
- کش پاسخ و جمع‌آوری لاگ درخواست در Gateway با هدر هر درخواست غیرفعال است. Cloudflare برای عبور درخواست همچنان محتوای آن را پردازش می‌کند.
- Cloudflare هر درخواست را فقط یک بار به مدل می‌فرستد؛ حداکثر یک تلاش مجدد برای خطاهای گذرا روی سرور برنامه کنترل می‌شود. مهلت کلی همچنان ۲۰ ثانیه است. در حالت Gateway، تلاش اول به‌صورت پیش‌فرض تا پایان این مهلت فرصت دارد؛ با `GEMINI_ATTEMPT_TIMEOUT_MS` قابل تنظیم است.
- هدر `cf-aig-no-wholesale: true` استفاده از fallback صورتحساب Cloudflare را مسدود می‌کند؛ درخواست از کلید Gemini خودت استفاده می‌کند.
- Cloudflare خطاهای سهمیه، ازدحام و محدودیت منطقه‌ای Google را تضمینی رفع نمی‌کند و کشور خروجی ثابتی تضمین نشده است. اگر Google مسیر را به‌علت منطقه رد کند، محل اجرای سرویس و دسترسی پروژه باید با مناطق پشتیبانی‌شدهٔ Google سازگار باشند.

مراجع: [Google AI Studio در Cloudflare](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/)، [احراز هویت](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)، [کنترل تلاش و مهلت پاسخ](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/)، [هدرها](https://developers.cloudflare.com/ai-gateway/glossary/)، [مناطق Gemini](https://ai.google.dev/gemini-api/docs/available-regions).

# کتابیار — KetabYar

[![CI check (Windows + Linux)](https://github.com/WasewaseX/ketabyar/actions/workflows/ci.yml/badge.svg)](https://github.com/WasewaseX/ketabyar/actions/workflows/ci.yml)
[![Release](https://github.com/WasewaseX/ketabyar/actions/workflows/release.yml/badge.svg)](https://github.com/WasewaseX/ketabyar/releases)
[![GitHub release](https://img.shields.io/github/v/release/WasewaseX/ketabyar)](https://github.com/WasewaseX/ketabyar/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**سامانهٔ مدیریت کتابخانهٔ دانشگاهی، کاملاً آفلاین، فارسی و راست‌به‌چپ (RTL)**

کتابیار یک برنامهٔ دسکتاپ بومی ویندوز است که با **Tauri 2 + Rust + React + SQLite** ساخته شده و برای کار روزمره هیچ اتصال اینترنتی‌ای لازم ندارد. همهٔ داده‌ها در یک فایل SQLite روی همین رایانه ذخیره می‌شود و هیچ‌وقت از دستگاه خارج نمی‌شود.

از نسخهٔ **1.0.3**، کل لایهٔ نرم‌افزاری کتابیار — از رابط کاربری و طراحی تا سرویس‌های داده و پوستهٔ Rust — بازنویسی کامل و اصیل است و تحت مجوز **MIT** منتشر می‌شود. (سابقهٔ پروژه در [NOTICE.md](NOTICE.md) شفاف ثبت شده است.)

## دانلود و نصب (ویندوز)

1. به بخش [Releases](https://github.com/WasewaseX/ketabyar/releases) بروید.
2. فایل `KetabYar_1.2.4_x64-setup.exe` را دانلود و اجرا کنید (نسخهٔ MSI هم موجود است).
3. در صورت نیاز، WebView2 به‌طور خودکار نصب می‌شود.

**پین پیش‌فرض ورود: `6767`** — بعد از اولین ورود از مسیر «تنظیمات ← عمومی ← حساب میز» آن را عوض کنید.

## امکانات

- **کاتالوگ کامل**: ثبت کتاب، نشریه و پایان‌نامه با شابک، ناشر، موضوع، ردهٔ دیویی، جلد و چندنسخه‌بودن
- **پرکردن خودکار با شابک**: دریافت مشخصات از Google Books و Open Library؛ و غنی‌سازی هوشمند اختیاری با Groq (همه‌چیز بدون اینترنت هم کار می‌کند)
- **اعضای دانشگاهی**: دانشجو، هیئت‌علمی، کارمند و مهمان + رشته/گروه + شناسهٔ عضویت + کارت عضویت
- **گردش امانت**: امانت داخلی (مطالعه در کتابخانه) و بیرون‌بر، سقف امانت، تمدید با سقف، ویرایش موعد
- **رزرو و صف انتظار**: درخواست → تأیید → آمادهٔ تحویل (با تخصیص خودکار نسخه) → تحویل؛ انقضای خودکار و ارتقای صف پس از بازگشت
- **جریمهٔ تأخیر (سبک کها)**: محاسبهٔ روزانه هنگام بازگشت، دورهٔ ارفاق، سقف جریمه، پرداخت و بخشیدن
- **انبار و نقشهٔ قفسه‌ها**: اتاق‌ها، ستون‌های قفسه، ردیف‌های حرفی A…F و قفسهٔ زمینی S با ظرفیت و اشغال زنده
- **اسکن بازرسی قفسه**: جلسهٔ اسکن با تشخیص «سر جای خود / جابه‌جا / ناشناس» و جابه‌جایی گروهی
- **گزارش‌ها و نمودارها**: چهار زبانهٔ تحلیلی، خروجی PDF فارسی (تقویم جلالی) و بستهٔ CSV/ZIP
- **اعلان‌ها و سابقهٔ فعالیت**: معوق، نزدیک موعد، آمادهٔ تحویل + لاگ کامل عملیات با جست‌وجو و خروجی CSV
- **پشتیبان‌گیری کامل**: خروجی/بازگردانی کل کتابخانه در یک فایل JSON + بازنشانی کارخانه‌ای دومرحله‌ای
- **تقویم شمسی (جلالی)** و اعداد فارسی در تمام نمایش‌ها؛ تم روشن/تیره، شش رنگ تأکیدی، اندازهٔ قلم

## حریم خصوصی

کتابیار آفلاین است: دادهٔ کتابخانه — اعضا، امانت‌ها، رزروها — **هرگز** از رایانه خارج نمی‌شود. تنها استثنا، دو ابزار اختیاریِ کاتالوگ‌گذاری است که فقط «عنوان یا شابک» را به Google Books / Open Library (و در صورت فعال‌سازی، Groq) می‌فرستند. جزئیات در برنامه: «قانونی ← سیاست حریم خصوصی».

## توسعه (Development)

```bash
npm install
npm run dev            # رابط وب (Vite) روی http://localhost:1420
npm run tauri dev      # پنجرهٔ بومی ویندوز
npm run build          # ساخت production فرانت‌اند
npm run tauri build    # نصب‌کنندهٔ NSIS + MSI
npm run typecheck      # بررسی تایپ‌ها
npm test               # آزمون‌های واحد (vitest)
```

پیش‌نیازها: Node 20+، Rust (stable) و روی ویندوز، MSVC Build Tools.

## دو ویرایش، یک برنامه (Two editions)

کتابیار با **دو موتور دادهٔ جایگزین** عرضه می‌شود که API عمومی‌شان دقیقاً یکسان است و انتخاب موتور در زمان ساخت انجام می‌شود:

| ویرایش | موتور | فایل نصب |
| --- | --- | --- |
| **TS Edition** | SQL در webview از طریق tauri-plugin-sql | `KetabYar_*-setup.exe` / `.msi` |
| **Rust Edition** | موتور بومی `ketabyar-core` (rusqlite) پشت Tauri commands — بدون هیچ SQL در webview (مخزن، احراز هویت پین و اسکیمای اولیه همگی بومی) + اتصال‌های تولیدشده با ts-rs | `KetabYarRust_*-setup.exe` |

ساخت:

```bash
npm run build          # ویرایش TS (پیش‌فرض)
npm run build:rust     # ویرایش Rust
cargo test --manifest-path src-tauri/core/Cargo.toml   # آزمون‌های یکپارچگی موتور Rust
```

در منبع، `src/data/repositories/library.ts` دیسپچر است: `librarySql.ts` (ویرایش TS) و `libraryRust.ts` (ویرایش Rust) باید از نظر ساختاری با هم یکسان بمانند — کامپایلر تایپ‌اسکریپت (`typeof SQL`) قرارداد سازگاری را اجرا می‌کند.

موتور فعال در هر نصب، در برنامه قابل بررسی است: «تنظیمات ← درباره ← موتور داده». (لایهٔ بوت/احراز هویت پین در هر دو ویرایش از همان فایل SQLite محلی مشترک استفاده می‌کند.)

## ساختار پروژه

```
src/
  app/            بوت، مسیرها، Provider ها
  components/     پوستهٔ برنامه، پالت فرمان، اجزای UI و طرح‌های SVG اصلی
  sections/       ۱۳ صفحهٔ برنامه (داشبورد تا تنظیمات)
  data/           لایهٔ SQLite: schema، localDb، سرویس‌های دامنه (۵۲ عملیات)
  data/repositories/  librarySql.ts + libraryRust.ts + دیسپچر library.ts
  types/generated/    اتصال‌های تولیدشدهٔ ts-rs از ketabyar-core
  store/          وضعیت سراسری (Zustand)
  i18n/           واژه‌نامهٔ فارسی (تک‌منبع حقیقت رشته‌ها)
  utils/          شابک/بارکد، تاریخ جلالی، خروجی‌ها، PDF، فراداده
src-tauri/        پوستهٔ Rust: SQLite، system tray، رویدادها، بسته‌بندی
src-tauri/core/   موتور بومی ketabyar-core: models، repo/*، schema، آزمون‌های یکپارچگی
```

## مجوز (License)

MIT — متن کامل در [LICENSE](LICENSE). فهرست بسته‌های متن‌باز در
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)، سابقهٔ شفاف پروژه در
[NOTICE.md](NOTICE.md)، تاریخچهٔ نسخه‌ها در [CHANGELOG.md](CHANGELOG.md) و
سیاست گزارش آسیب‌پذیری در [SECURITY.md](SECURITY.md). قلم‌های Vazirmatn /
IBM Plex Sans Arabic / Manrope تحت SIL OFL 1.1 همراه برنامه توزیع می‌شوند.

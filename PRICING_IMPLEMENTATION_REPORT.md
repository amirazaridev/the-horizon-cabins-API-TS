# گزارش پیاده‌سازی سیستم قیمت‌گذاری پویا

شاخه: `feature/dynamic-pricing` — **هیچ کامیتی به ریموت push نشده است.**
وضعیت: تمام فازها (P0 تا P9) کامل شده‌اند.

---

## ۱. خلاصه اجرایی

یک سیستم قیمت‌گذاری پویا برای کابین‌ها ساخته شد که در آن قیمت هر شب از روی
«قواعد قیمت» (تخفیف/افزایش، به‌صورت بازه‌ی تاریخی یا روزهای هفته) محاسبه
می‌شود. موتور محاسبه یک تابع **pure و قطعی** (`src/utils/pricing.engine.ts`)
است و تنها منبع حقیقت به‌شمار می‌رود: تمام مسیرهای دیگر (لیست کابین، تقویم
قیمت، صدور پیش‌فاکتور، ساخت رزرو) از همین موتور تغذیه می‌کنند تا هیچ‌گاه دو
فرمول متفاوت در پروژه وجود نداشته باشد.

نتیجه‌ی محاسبه‌ی هر شب در یک read-model به نام `cabin_daily_prices` مادی
می‌شود (پنجره‌ی چرخان ۱۲۰ روزه) و هم با یک جاب شبانه و هم به‌صورت دستی
قابل بازسازی است. هنگام ثبت رزرو، قیمت هر شب به‌صورت **اسنپ‌شات تغییرناپذیر**
در جدول `booking_nights` ذخیره می‌شود، پس مجموع بهای یک رزرو پس از ساخت
هرگز تغییر نمی‌کند ــ حتی اگر بعداً قواعد قیمت عوض شوند.

ستون قدیمی `discount` روی جدول `cabins` به‌طور کامل حذف شد و محاسبه‌ی
درصدیِ باگ‌دارِ قبلی (تفریق مطلق به‌جای درصد) جای خود را به موتور جدید داد.

---

## ۲. تغییرات به تفکیک ماژول/فایل

### ۲.۱ هسته‌ی قیمت‌گذاری (P1)

| فایل | نقش |
|---|---|
| `src/constants/pricing.constants.ts` | تمام ثابت‌ها + `getPricingLimits()` (async، آماده‌ی مهاجرت به جدول `Setting`) |
| `src/utils/pricing.engine.ts` | موتور pure: `rulesForNight`، `calculateNightPrice`، `calculateStayPrice`، `quoteStayPrice`، `applyDefensiveLimits`، `validateRuleSet` |
| `src/types/pricing.types.ts` | تایپ‌های `PriceRule`، `NightPriceBreakdown`، `QuotedNight/QuotedStay`، `PricingLimits` |
| `src/utils/pricing.validator.ts` | اعتبارسنجی مجموعه‌ی قواعد (سقف تعداد و درصد) |

### ۲.۲ مدل داده و مهاجرت (P2)

| فایل | نقش |
|---|---|
| `prisma/schema.prisma` | مدل‌های `PriceRule`، `CabinDailyPrice`، `BookingNight`، `PriceRuleAudit` + enumها |
| `prisma/migrations/20261004121500_add_dynamic_pricing/migration.sql` | ساخت جدول‌ها، CHECKها، backfill، حذف `cabins.discount` |
| `prisma/seeds/data/price-rule.ts` + `prisma/seeds/price-rule.seed.ts` | داده و seed قاعده‌های نمونه |
| `prisma/seed.ts` | افزودن `seedPriceRules` و `rebuildAllCabinPriceCalendars` به ترتیب seed و `syncSequences` |

### ۲.۳ مدیریت قواعد قیمت (P3)

| فایل | نقش |
|---|---|
| `src/repositories/price-rule.repository.ts` | تمام کوئری‌های Prisma قواعد + audit |
| `src/services/price-rule.service.ts` | CRUD، بررسی تداخل روی شب‌ها، قفل، لاگ audit، bulk |
| `src/controllers/price-rule.controller.ts` | هندلرها |
| `src/routes/price-rule.route.ts` | مسیرهای `price-rules` |
| `src/validations/price-rule.validation.ts` | اسکیمای Zod قاعده (با `superRefine` برای kind↔dateRange/weekday) |

### ۲.۴ تقویم قیمت و جاب روزانه (P4)

| فایل | نقش |
|---|---|
| `src/repositories/price-calendar.repository.ts` | bulk upsert/delete ردیف‌های تقویم با SQL پارامتری |
| `src/services/price-calendar.service.ts` | `getCalendarWindow`، `rebuildCabinPriceCalendar`، `rebuildAllCabinPriceCalendars`، `runDailyPriceCalendarMaintenance` |
| `src/jobs/price-calendar.job.ts` | جاب دوره‌ای (با advisory lock `pg_try_advisory_xact_lock`) |
| `src/controllers/price-calendar.controller.ts` + `src/routes/price-calendar.route.ts` | endpointهای تقویم و rebuild |
| `src/validations/price-calendar.validation.ts` | اعتبارسنجی بازه‌ی تقویم |

### ۲.۵ تغییرات رزرو (P5)

| فایل | نقش |
|---|---|
| `src/services/booking.service.ts` | `createBooking` بازنویسی شد؛ `getPriceQuote` اضافه شد |
| `src/utils/booking-date.util.ts` | `validateStayRange` مشترک (start/end، افق ۱۲۰ روز، ۱..۳۰ شب) |
| `src/utils/booking-price.util.ts` | حذف helperهای مرده؛ نگه‌داشتن `sumNightPrices`/`fitsInt32` |
| `src/repositories/booking.repository.ts` | افزودن `createBookingNights`، `findBookingNights`، `nights` به select |
| `src/validations/booking.validation.ts` | `expectedTotalPrice` اختیاری + `priceQuoteSchema` |
| `src/controllers/cabin.controller.ts` + `src/routes/cabin.route.ts` | endpoint `GET /cabins/:cabinId/price-quote` |

### ۲.۶ لیست کابین (P6)

| فایل | نقش |
|---|---|
| `src/repositories/cabin.repository.ts` | مسیر قیمت‌محور: `findAllCabinsWithPricing`، `queryStayPricing`، `queryStartingPrice`، `enrichWithStartingPrice` |
| `src/types/cabin.types.ts` | `CabinPricing` (stay/startingFrom)، `CabinWithPricing`، `CabinSort` |
| `src/validations/cabin.validation.ts` | پارامترهای `totalPrice`/`startDate`/`endDate`/`sort` + `superRefine` |
| `src/services/cabin.service.ts` + `src/controllers/cabin.controller.ts` | خروجی جدید `PaginatedResult<CabinWithPricing>` |

### ۲.۷ سخت‌سازی کابین و پاک‌سازی `discount` (P7)

| فایل | نقش |
|---|---|
| `src/routes/cabin.route.ts` | محافظت از نوشتن‌های کابین با `protect + restrictTo(admin|owner)` |
| `src/constants/booking.constants.ts` | افزودن `BOOKING_STATUS_DB` (نگاشت مقدار enum به literal دیتابیس) |
| `src/utils/booking-price.util.ts` | حذف کامل `calculateCabinPrice`/`calculateTotalPrice` |

### ۲.۸ مستندات (P8)

`PROJECT_OVERVIEW.md`، `README.md`، `TESTING.md`، `PRICING_PLAN.md` به‌روزرسانی شدند.

---

## ۳. مدل داده و مهاجرت‌ها

مهاجرت جدید: `20261004121500_add_dynamic_pricing`.

### جدول‌های جدید

- **`price_rules`** — قواعد قیمت‌گذاری (نوع، شکل، درصد، تاریخ/روزهای هفته، فعال بودن، کاربر سازنده/ویرایشگر).
- **`cabin_daily_prices`** — read-model مادی‌شده؛ کلید ترکیبی `(cabin_id, date)`.
- **`booking_nights`** — اسنپ‌شات تغییرناپذیر قیمت هر شب رزرو؛ کلید ترکیبی `(booking_id, date)`.
- **`price_rule_audits`** — تاریخچه‌ی عملیات روی قواعد (مستقل از حذف قاعده).

### ستون حذف‌شده

- `cabins.discount` در همین مهاجرت حذف شد (`ALTER TABLE "cabins" DROP COLUMN "discount"`).

### CHECK constraintها

- `percent` بین ۱ و ۵۰.
- برای `kind = date_range` هر دو تاریخ اجباری و `start_date <= end_date`.
- برای `kind = weekday` آرایه‌ی `weekdays` غیرخالی و مقادیر در بازه‌ی ISO ۱..۷.

### منطق backfill

قاعده‌های نمونه و سپس تقویم همه‌ی کابین‌ها با موتور بازسازی می‌شوند؛ seed
پروژه (`prisma db seed`) پس از seed قواعد، `rebuildAllCabinPriceCalendars()`
را صدا می‌زند و ۱۲۰۰ ردیف تقویم (۱۰ کابین × ۱۲۰ شب) می‌سازد.

---

## ۴. جدول endpointها

| Method | Path | دسترسی | توضیحات |
|---|---|---|---|
| GET | `/api/v1/cabins/:cabinId/price-rules` | admin\|owner | لیست قواعد یک کابین |
| POST | `/api/v1/cabins/:cabinId/price-rules` | admin\|owner | ساخت قاعده |
| PATCH | `/api/v1/price-rules/:id` | admin\|owner | ویرایش قاعده (با کنترل هم‌زمانی) |
| DELETE | `/api/v1/price-rules/:id` | admin\|owner | حذف نرم قاعده |
| POST | `/api/v1/price-rules/bulk` | admin\|owner | ساخت/ویرایش گروهی |
| GET | `/api/v1/cabins/:cabinId/price-calendar` | عمومی | تقویم قیمت روزانه |
| GET | `/api/v1/cabins/:cabinId/price-quote` | عمومی | پیش‌فاکتور یک بازه‌ی اقامت |
| POST | `/api/v1/price-calendar/rebuild` | owner | بازسازی تقویم‌ها |

### تغییرات endpointهای موجود

- `GET /api/v1/cabins` — پارامترهای جدید `startDate`/`endDate`/`totalPrice`/`sort` و آیتم جدید `pricing` در هر کابین.
- `POST/PATCH/DELETE /api/v1/cabins...` و مسیرهای دسته‌بندی کابین — از «عمومی» به **admin\|owner** تغییر کردند (سخت‌سازی امنیتی P7).
- `POST /api/v1/bookings` — پارامتر اختیاری `expectedTotalPrice` برای تشخیص تغییر قیمت.

---

## ۵. تغییرات breaking برای فرانت‌اند

1. **حذف `discount`** — دیگر در بدنه/پاسخ کابین وجود ندارد.
2. **معنای جدید `cabinPrice`** — اکنون «جمع قیمت شب‌ها بدون اضافات» است (قبلاً یک قیمت شبانه‌ی واحد).
3. **افق ۱۲۰ روزه** — رزرو بیش از ۱۲۰ روز جلوتر و اقامت بیش از محدوده‌ی شب مجاز رد می‌شود (قبلاً ۳۶۵).
4. **شیء جدید `pricing`** در خروجی لیست کابین: `{ mode: "stay", nights, totalPrice, avgNightlyPrice }` یا `{ mode: "startingFrom", startingPrice, windowDays }`.
5. **پارامترهای جدید کوئری**: `startDate`، `endDate`، `totalPrice`، `sort`؛ `price` و `totalPrice` با هم مجاز نیستند و `totalPrice` بدون تاریخ‌ها رد می‌شود.
6. **خطای `PRICE_CHANGED` (۴۰۹)** — اگر `expectedTotalPrice` ارسالی با قیمت واقعی نخواند.
7. **protect شدن مسیرهای نوشتن کابین** — فرانت باید کوکی JWT معتبرِ admin/owner بفرستد.

---

## ۶. ثابت‌ها و مقادیرشان

| ثابت | مقدار | توضیح |
|---|---|---|
| `MAX_DISCOUNTS_PER_NIGHT` | 2 | حداکثر تخفیف هم‌زمان در یک شب |
| `MAX_SURCHARGES_PER_NIGHT` | 2 | حداکثر افزایش هم‌زمان در یک شب |
| `MAX_TOTAL_DISCOUNT_PERCENT` | 50 | سقف جمع درصد تخفیف هر شب |
| `MAX_TOTAL_SURCHARGE_PERCENT` | 100 | سقف جمع درصد افزایش هر شب |
| `MAX_NIGHTLY_PRICE` | 70,000,000 | سقف قیمت یک شب (تومان) |
| `MIN_REGULAR_PRICE` | 1,000,000 | کمینه‌ی `regularPrice` |
| `MAX_REGULAR_PRICE` | 35,000,000 | مشتق‌شده = `floor(MAX_NIGHTLY_PRICE / 2)` |
| `MAX_ADVANCE_BOOKING_DAYS` | 120 | افق رزرو |
| `PRICE_CALENDAR_HORIZON_DAYS` | 120 | افق تقویم قیمت = افق رزرو |
| `STARTING_PRICE_WINDOW_DAYS` | 30 | پنجره‌ی محاسبه‌ی startingPrice |
| `PRICE_RULE_MAX_FUTURE_DAYS` | 365 | حداکثر فاصله‌ی endDate قاعده از امروز |

**فرمول ترکیب:** `final = floor(base * (100 + S) * (100 - D) / 10000)` — تمام‌عدد، بدون اعشار.

**مهاجرت آینده به جدول `Setting`:** تمام کد از `getPricingLimits()` (تابع async)
استفاده می‌کند، نه import مستقیم ثابت‌ها؛ بنابراین وقتی مقادیر به جدول
`Setting` منتقل شدند، فقط بدنه‌ی همین تابع تغییر می‌کند و هیچ فراخوانی‌ای
لمس نمی‌شود. (جدول `Setting` در دیتابیس وجود دارد اما الان استفاده نمی‌شود.)

---

## ۷. تصمیم‌های فنی و فرض‌های گرفته‌شده

1. **فایل `HORIZON_CABINS_API_PROJECT_CONTEXT.md` وجود ندارد.** نزدیک‌ترین مرجع
   `PROJECT_OVERVIEW.md` است که در ابتدا قدیمی (استیل) بود؛ کد واقعی منبع حقیقت قرار گرفت.
2. **چیدمان flat پروژه حفظ شد** (پروپمت به `src/modules/pricing/...` اشاره داشت).
   فایل‌ها با نام‌های `pricing.*` اما در پوشه‌های موجود پروژه (`constants/`, `utils/`) قرار گرفتند.
3. **`Booking.totalPrice` از BigInt به Int تغییر یافت** (با مهاجرت `20261003182323`).
   برای محافظت از سرریز Int32، helper `sumNightPrices` در صورت عبور از سقف `null` می‌دهد.
4. **قیمت‌ها همیشه `Int` (تومان)**؛ هیچ عدد اعشاری در مسیر پول استفاده نمی‌شود.
5. **تاریخ‌ها در Asia/Tehran** و به‌صورت `Date` نیمه‌شب UTC ذخیره می‌شوند (`@db.Date`).
6. **`signup` نمی‌تواند نقش admin بگیرد** (گارد mass-assignment)؛ ارتقا مستقیم در DB.
7. **enum دیتابیس برای `checkedIn` مقدار `checked-in` است** (با خط تیره، نه snake_case).
   تزریق خام این مقادیر با `Prisma.join` باعث خطای `22P02` می‌شد؛ با ثابت
   `BOOKING_STATUS_DB` و `Prisma.raw` حل شد.

---

## ۸. تست‌ها

### دستورهای اجراشده و نتایج واقعی

#### خط پایه (پیش از شروع، در `PRICING_PLAN.md` ثبت شده)

| بررسی | دستور | نتیجه |
|---|---|---|
| Unit | `npm run test:unit` | **167 / 167** (۶ فایل) |
| Integration | `npm run test:integration` | **101 / 101** (۴ فایل) |
| Typecheck | `npx tsc --noEmit` | **۱ خطای از قبل موجود** |
| Lint | `npm run lint` | **۰ خطا، ۲ هشدار** (`helmet`/`cors`) |

#### وضعیت نهایی (P8)

| بررسی | دستور | نتیجه |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **۰ خطا** |
| Lint | `npx eslint .` | **۰ خطا، ۲ هشدار** (از قبل موجود) |
| Unit | `npx vitest run --config vitest.unit.config.ts` | **۲۲۷ / ۲۲۷** (۱۰ فایل) |
| Integration | `npx vitest run --config vitest.integration.config.ts` | **۱۷۵ / ۱۷۵** (۹ فایل) |
| مهاجرت از صفر | `prisma migrate deploy` روی DB خالی | **۷/۷ مهاجرت موفق** |
| Seed از صفر | `prisma db seed` | **۱۰ کابین، ۳ قاعده، ۱۲۰۰ ردیف تقویم** |

> تعداد Unit از ۲۳۱ به ۲۲۷ کاهش یافت چون ۱۰ تست مربوط به helperهای قدیمیِ حذف‌شده
> (`calculateCabinPrice`/`calculateTotalPrice`) با ۶ تست جدید `sumNightPrices`/`fitsInt32`
> جایگزین شد. Integration از ۱۰۱ به ۱۷۵ رسید (۴ فایل جدید: `booking-pricing`،
> `cabin-listing`، `cabin-guards`، `price-calendar`، `price-rule`).

### فایل‌های تست جدید

- `tests/unit/utils/pricing.engine.test.ts` (۱۷) — موتور خالص
- `tests/unit/utils/pricing.validator.test.ts` (۱۳) — سقف تعداد/درصد
- `tests/unit/constants/pricing.constants.test.ts` (۴)
- `tests/unit/validations/price-rule.validation.test.ts` (۲۳)
- `tests/integration/routes/price-rule.routes.test.ts` (بزرگ‌ترین، شامل bulk/audit/قفل)
- `tests/integration/routes/price-calendar.routes.test.ts`
- `tests/integration/routes/booking-pricing.routes.test.ts` (۱۱)
- `tests/integration/routes/cabin-listing.routes.test.ts` (۱۸)
- `tests/integration/routes/cabin-guards.routes.test.ts` (۱۲)

---

## ۹. مسائل کشف‌شده خارج از scope (تغییر ندادم)

1. **جاب انقضای رزرو هرگز استارت نمی‌شود.** `startBookingExpirationJob()` صادر
   شده اما در `src/server.ts` صدا زده نمی‌شود (فقط `startOtpCleanupJob` و
   `startPriceCalendarJob`). طبق محدوده تغییری اعمال نکردم و اینجا گزارش می‌کنم.
2. **`helmet` و `cors` در `src/app.ts` import شده‌اند اما کامنت‌اند** (۲ هشدار lint). دست‌نخورده ماند.
3. **جداول قدیمی و کامنت‌شده‌ی `setting`** بدون route/controller/service باقی ماندند.
4. **`Settings` ماژول** هنوز پیاده‌سازی مستقل ندارد.

---

## ۱۰. ریسک‌ها و موارد ناتمام

- **پنجره‌ی ۱۲۰ روزه**: هر کابین فقط برای ۱۲۰ شب آینده ردیف تقویم دارد. اگر جاب
  شبانه از کار بیفتد، تقویم به‌صورت خودکار در زمان خواندن (self-healing) برای
  بازه‌ی درخواست تکمیل می‌شود، اما این رفتار نیازمند تست بار در محیط عملیاتی است.
- **مقادیر `Setting`**: مهاجرت ثابت‌ها به جدول `Setting` انجام نشده (فقط آماده‌سازی
  با `getPricingLimits()`). تا آن زمان تغییر مقادیر نیازمند دیپلوی مجدد است.
- **مهاجرت روی DB پر**: مهاجرت حذف `cabins.discount` یک `DROP COLUMN` مستقیم است؛
  اگر داده‌ای در آن ستون باارزش باشد، باید پیش از اجرا بکاپ گرفته شود (که در محیط توسعه انجام شد).

---

## ۱۱. راهنمای اجرا

```bash
# ۱) نصب و تولید کلاینت Prisma
npm install
npx prisma generate

# ۲) اجرای مهاجرت‌ها روی DB
npx prisma migrate deploy

# ۳) seed (قواعد نمونه + بازسازی خودکار تقویم همه‌ی کابین‌ها)
npx prisma db seed

# ۴) اجرای سرور (جاب تقویم قیمت با شروع سرور فعال می‌شود)
npm run dev

# ۵) تست‌ها
npm run test:unit
npm run test:integration   # نیازمند DB تست (Horizon_DB_test)
npm run test:db:setup      # ساخت اولیه‌ی DB تست
```

---

## ۱۲. فهرست کامیت‌های محلی (هیچ‌کدام push نشده‌اند)

```
47c4665  P8: docs refresh and full verification
bb12ad0  P7: harden cabin routes and finish legacy pricing cleanup
f5c665f  P6: cabin listing with pricing filters, sorting and availability
49870d7  feat(pricing): P5 per-night booking snapshot and price quote endpoint
e63cc7d  feat(pricing): P4 price calendar builder, daily job and endpoints
4f90a1d  feat(pricing): P3 rule management (CRUD, permissions, locking, audit, bulk)
d4529f0  feat(pricing): P2 schema, migration, seed and discount removal
880b8bc  feat(pricing): P1 pure pricing engine, constants and limit validator
99b1368  chore(pricing): P0 reconnaissance, baseline and implementation plan
```

قاعده‌ی `origin/feature/dynamic-pricing` نسبت به شاخه‌ی محلی: `ahead 5` (یعنی کامیت‌های
P0–P3 از قبل روی ریموت بودند و P4–P8 فقط محلی‌اند). **هیچ `git push` اجرا نشده است.**

خلاصه‌ی آماری تجمعی کار قیمت‌گذاری (نسبت به `e6b3075`):
**۶۰ فایل، +۵۸۰۵ / −۳۹۰ خط.**

---

## ۱۳. جمع‌بندی وضعیت فازها

| فاز | عنوان | وضعیت |
|---|---|---|
| P0 | شناسایی، خط پایه، برنامه | ✅ کامل |
| P1 | موتور pure + ثابت‌ها + validator | ✅ کامل |
| P2 | اسکیمای Prisma، مهاجرت، seed، حذف `discount` | ✅ کامل |
| P3 | مدیریت قواعد (CRUD/دسترسی/قفل/audit/bulk) | ✅ کامل |
| P4 | سازنده‌ی تقویم، جاب روزانه، endpointها | ✅ کامل |
| P5 | تغییرات رزرو + `price-quote` | ✅ کامل |
| P6 | لیست کابین | ✅ کامل |
| P7 | سخت‌سازی کابین + حذف کامل `discount` | ✅ کامل |
| P8 | تست/تایپ/لینت + مهاجرت و seed از صفر + مستندات | ✅ کامل |
| P9 | گزارش نهایی فارسی | ✅ کامل (همین فایل) |

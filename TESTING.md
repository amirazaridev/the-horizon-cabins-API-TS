# مستندات تست پروژه‌ی The Horizon Cabins API

> این سند، مرجع فنیِ ساختار و رویکرد تست‌های پروژه است. هر فایل تست و پوشه‌ی تست
> بهترتیب ساختار پروژه توضیح داده شده، دلیل انتخاب هر تست و هدفی که پوشش می‌دهد
> آمده، تنظیمات و متغیرهای محیطی تست و دلیل انتخاب آن‌ها شرح داده شده، و پوشه‌ی
> `setup` (شامل ساخت و آماده‌سازی دیتابیس تست) به‌طور کامل باز شده است.

---

## فهرست

1. [مرور کلی و استراتژی تست](#۱-مرور-کلی-و-استراتژی-تست)
2. [معماری و سازمان‌دهی تست‌ها](#۲-معماری-و-سازماندهی-تستها)
3. [فایل‌های پیکربندی (Vitest / tsconfig / ESLint)](#۳-فایلهای-پیکربندی)
4. [متغیرهای محیطی و فایل `.env.test`](#۴-متغیرهای-محیطی-و-فایل-envtest)
5. [پوشه‌ی `tests/setup/` — آماده‌سازی و ساخت دیتابیس تست](#۵-پوشهی-testssetup)
6. [پوشه‌ی `tests/helpers/`](#۶-پوشهی-testshelpers)
7. [پوشه‌ی `tests/unit/`](#۷-پوشهی-testsunit)
8. [پوشه‌ی `tests/integration/`](#۸-پوشهی-testsintegration)
9. [استراتژی کلی، کنوانسیون‌ها و یافته‌های واقعی](#۹-استراتژی-کلی-کنوانسیونها-و-یافتهها)
10. [اجرای محلی و CI](#۱۰-اجرای-محلی-و-ci)
11. [پیوست: درخت کامل فایل‌ها](#پیوست-درخت-کامل-فایلها)

---

## ۱. مرور کلی و استراتژی تست

### ۱.۱ پروژه

**The Horizon Cabins API** یک بک‌اند RESTful برای پلتفرم رزرو کابین است؛ ساخته‌شده با:

| لایه | فناوری |
|------|--------|
| Runtime | Node.js >= 21 (ESM) |
| Framework | Express 5 |
| Language | TypeScript 6 (strict) |
| ORM | Prisma 7 با درایور `@prisma/adapter-pg` |
| Database | PostgreSQL |
| Validation | Zod 4 |
| Authentication | JWT در httpOnly cookie + bcrypt |
| Test Runner | Vitest 5 |
| HTTP Test | supertest 7 |

معماری لایه‌ای و جریان درخواست:

```
Request → app.ts → routes → middlewares (auth/validate/pagination) → controllers → services → repositories → Prisma → PostgreSQL
```

هر لایه یک مسئولیت دارد: `routes` مسیر را تعریف می‌کند، `middlewares` اعتبارسنجی/احراز هویت می‌کند،
`controllers` ورودی/خروجی را مدیریت می‌کند، `services` منطق دامنه را دارد، و `repositories` تنها جایی است
که Prisma صدا زده می‌شود.

### ۱.۲ چرا و چطور تست می‌کنیم (استراتژی)

پروژه از یک **استراتژی دو‌پروژه‌ای (two-project)** پیروی می‌کند که رایج‌ترین و مقرون‌به‌صرفه‌ترین الگو در
پروژه‌های Express + Prisma است:

| پروژه | دامنه | دیتابیس | سرعت | دستور |
|--------|--------|---------|-------|-------|
| **unit** | utils، validations، services (با repositoryهای mock) | ندارد | بسیار سریع | `npm run test:unit` |
| **integration** | repositories، routes (HTTP)، jobs، concurrency | دیتابیس واقعی | کندتر | `npm run test:integration` |

**دلیل این تفکیک:**

1. **بازخورد سریع:** تست‌های unit در چند صد میلی‌ثانیه اجرا می‌شوند و در حین توسعه بدون نیاز به دیتابیس قابل اجرا هستند.
2. **جداسازی ریسک:** تست‌های integration به دیتابیس واقعی نیاز دارند و ذاتاً کندتر و شکننده‌ترند؛ جداکردن آن‌ها باعث می‌شود شکست یک تست دیتابیسی، توسعه‌ی روزمره را متوقف نکند.
3. **آزمایش درست در سطح درست:** منطق دامنه (قوانین تاریخ، قیمت، ترنزیشن وضعیت) در سطح **unit** با mock آزمایش می‌شود؛ اما چیزهایی که فقط با PostgreSQL واقعی قابل اثبات‌اند — مثل exclusion constraint، تراکنش `SERIALIZABLE` و retry روی `P2034` — در سطح **integration** آزمایش می‌شوند.
4. **امنیت عملیاتی:** تست‌های integration جدول‌ها را `TRUNCATE` می‌کنند؛ با جداسازی و محافظ نام دیتابیس، این عملیات هرگز روی دیتابیس dev/production اجرا نمی‌شود.

**چهار اصل حاکم بر تست‌ها:**

- **استقلال تست:** هر تست داده‌ی خودش را می‌سازد و به ترتیب اجرا وابسته نیست.
- **استفاده از factory به‌جای کپی:** هیچ تستی ردیف را «دستی» نمی‌سازد؛ همه از `tests/helpers/factories.ts` استفاده می‌کنند.
- **قطعیت زمان:** تست‌های وابسته به زمان از `vi.useFakeTimers()` و `vi.setSystemTime()` استفاده می‌کنند.
- **صداقت:** اگر تستی باگ واقعی را کشف کند، تست رفتار صحیح را مستند می‌کند و باگ در گزارش اعلام می‌شود — نه اینکه تست برای «سبز شدن» ضعیف شود.

### ۱.۳ دامنه‌ی فعلی

تست‌ها در حال حاضر **ماژول Booking** را پوشش می‌دهند (قلب پروژه و حساس‌ترین بخش از نظر پول و رزرو).

| مجموعه | تعداد تست | وضعیت |
|--------|-----------|--------|
| Unit | ۱۶۷ | ✅ همه سبز |
| Integration | ۱۰۱ | ✅ همه سبز |
| **مجموع** | **۲۶۸** | ✅ |

پوشش کد: `booking.service.ts` ≈ ۹۹٪ statements، `booking.repository.ts` ≈ ۹۷٪، validations/controller ۱۰۰٪.

---

## ۲. معماری و سازمان‌دهی تست‌ها

### ۲.۱ اصول سازمان‌دهی

- **تست‌ها بیرون از `src/` قرار دارند** (در `tests/`) تا کد production تمیز بماند و بیلد (`tsconfig.build.json`) آن‌ها را شامل نشود.
- **آینه‌کردن ساختار `src/`:** پوشه‌های داخل `tests/unit` و `tests/integration` ساختار `src/` را بازتاب می‌دهند (`utils/`، `validations/`، `services/`، `repositories/`، `routes/`، `jobs/`). این کار یافتن تست متناظر با یک ماژول را بدیهی می‌کند.
- **جداسازی «ابزار» از «تست»:** پوشه‌های `setup/` و `helpers/` زیرساخت‌اند و خودشان تست نیستند؛ الگوی include فقط `*.test.ts` را برمی‌دارد.
- **نام‌گذاری:** فایل تست = نام ماژول + `.test.ts`؛ `describe` و `it` به انگلیسی (هم‌راستا با پیام‌های خطای پروژه)؛ کامنت‌ها فارسی.

### ۲.۲ نقشه‌ی ذهنی: چه چیزی کجا تست می‌شود؟

```
src/utils/*          → tests/unit/utils/*            (توابع خالص، بدون DB)
src/validations/*    → tests/unit/validations/*      (اسکیمای Zod)
src/services/*       → tests/unit/services/*         (منطق دامنه، repository mock)
src/repositories/*   → tests/integration/repositories/* (کوئری واقعی Prisma)
src/routes/*+app.ts  → tests/integration/routes/*    (HTTP end-to-end با supertest)
cron/jobs            → tests/integration/jobs/*      (منطق handler با DB واقعی)
هم‌زمانی/تراکنش      → tests/integration/services/*  (چند درخواست موازی)
```

---

## ۳. فایل‌های پیکربندی

### ۳.۱ سه فایل Vitest — و دلیل سه‌تایی بودن

| فایل | نقش |
|------|------|
| `vitest.unit.config.ts` | پروژه‌ی `unit`؛ بدون دیتابیس؛ سریع |
| `vitest.integration.config.ts` | پروژه‌ی `integration`؛ دیتابیس واقعی؛ ترتیبی |
| `vitest.config.ts` | پیکربندی پیش‌فرض؛ به پروژه‌ی `unit` اشاره می‌کند |

**چرا سه فایل؟** Vitest 5 امکان تعریف چند «project» در یک فایل را دارد، اما تفکیک به سه فایل
مزایای عملی دارد: هر پروژه تنظیمات مستقل خودش را دارد (مثلاً `fileParallelism`، `globalSetup`، timeoutها)،
اسکریپت‌های npm مستقیماً به فایل موردنظر اشاره می‌کنند، و اجرای تصادفی `npx vitest` هم (به‌کمک
`vitest.config.ts`) نتیجه‌ی درست و سبک می‌دهد.

**`vitest.unit.config.ts`**

```ts
export default defineConfig({
  test: {
    name: "unit",
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup/load-env.ts"],
    env: { NODE_ENV: "test" },
  },
});
```

- `include` فقط تست‌های unit را برمی‌دارد؛ تست‌های integration اصلاً load نمی‌شوند.
- `setupFiles` فایل `load-env.ts` را **قبل از هر import** اجرا می‌کند (دلیلش در بخش ۴).
- `globals: true` امکان استفاده از `describe`/`it`/`expect` بدون import صریح را می‌دهد (هرچند در این پروژه صریح import می‌شوند).
- `environment: "node"` چون کد سمت سرور است (نیازی به DOM نیست).

**`vitest.integration.config.ts`**

```ts
export default defineConfig({
  test: {
    name: "integration",
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    setupFiles: ["./tests/setup/integration.setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    maxWorkers: 1,
  },
});
```

- **`fileParallelism: false` + `maxWorkers: 1` + `pool: "forks"`:** حیاتی‌ترین تنظیم. فایل‌های integration
  همه روی **یک** دیتابیس کار می‌کنند و در `beforeEach` جدول‌ها را `TRUNCATE` می‌کنند. اگر موازی اجرا شوند،
  پاک‌سازی یک فایل، داده‌ی فایل دیگر را نابود می‌کند. اجرای ترتیبی در یک fork این تداخل را حذف می‌کند.
- **`testTimeout: 30_000` و `hookTimeout: 60_000`:** عملیات دیتابیسی (migration، تراکنش‌های `SERIALIZABLE`)
  می‌توانند از پیش‌فرض ۵ ثانیه بیشتر طول بکشند؛ این مقادیر از flaky شدن جلوگیری می‌کنند.
- **`globalSetup`:** یک بار قبل از کل run اجرا می‌شود و مسئول آماده‌سازی دیتابیس است (بخش ۵).

### ۳.۲ `tsconfig.json` و نکته‌ی مهم درباره‌ی تست‌ها

```jsonc
// tsconfig.json
{ "include": ["src", "prisma7.config.ts"] }
// tsconfig.build.json
{ "extends": "./tsconfig.json", "include": ["src"] }
```

**نکته‌ی کلیدی معماری:** پوشه‌ی `tests/` **در `tsconfig.json` نیست**. یعنی دستور `npx tsc --noEmit`
تست‌ها را type-check نمی‌کند و بیلد production هم هرگز فایل‌های تست را کامپایل نمی‌کند. این تصمیم آگاهانه است:

- Vitest فایل‌های تست را با esbuild به‌صورت on-the-fly ترنسپایل می‌کند و به `tsc` نیازی ندارد.
- تست‌ها نباید به artifact بیلد (`dist/`) راه پیدا کنند.
- اگر بخواهید تست‌ها هم type-check شوند، می‌توانید یک `tsconfig.test.json` جدا با `"include": ["tests", "src"]` بسازید و در CI اجرا کنید؛ اما در پیکربندی فعلی، تضمین تایپ برای تست‌ها بر عهده‌ی خود Vitest/ویرایشگر است.

> **پیامد عملی:** خطای `npx tsc --noEmit` روی `src/utils/booking-price.util.test.ts` (فایل تست قدیمی
> که `calculateNumNights` را import می‌کند در حالی که export نشده) به همین دلیل رخ می‌دهد که آن فایل
> **داخل `src`** است و اتفاقاً در دامنه‌ی tsc قرار می‌گیرد. این خطا از قبل موجود بوده و بی‌ربط به ماژول Booking است.

### ۳.۳ ESLint

`eslint.config.ts` فقط `dist/**` و `node_modules/**` را ignore می‌کند؛ پس **فایل‌های تست هم lint می‌شوند**.
برای تست‌ها مجبور شدیم چند قاعده را رعایت کنیم:

- `no-console` با `allow: ["warn","error"]` — به همین دلیل لاگ‌های عیب‌یابی تست‌ها با `console.warn`/`console.info` نوشته می‌شوند.
- متغیرهای بی‌استفاده باید با `_` شروع شوند یا با `void x;` مصرف شوند (مثلاً `const ctx = useIntegrationDb(); void ctx;`).
- `n/no-process-exit` فعال است؛ در اسکریپت‌ها به‌جای `process.exit(1)` از `throw` استفاده می‌کنیم.

---

## ۴. متغیرهای محیطی و فایل `.env.test`

### ۴.۱ چرا `.env.test` و چرا commit شده؟

`.env.test` یک فایل env اختصاصی تست است که **عمداً در git commit شده** (با `!.env.test` در `.gitignore`
از ignore شدن مستثنا شده). دلیل:

- مقادیر آن **راز واقعی نیستند** (`JWT_SECRET` جعلی، `SUPABASE_*` تستی، SMTP خالی).
- تست‌های integration بدون آن اصلاً اجرا نمی‌شوند؛ commit بودن آن باعث می‌شود CI و هر توسعه‌دهنده‌ی جدید
  بدون تنظیم دستی، همان پیکربندی را داشته باشد.
- `DATABASE_URL` آن به دیتابیس **جداگانه‌ی** `Horizon_DB_test` اشاره می‌کند (نه دیتابیس dev).

### ۴.۲ محتوای `.env.test`

```dotenv
NODE_ENV=test
PORT=3999
DATABASE_URL=postgresql://postgres:1234@localhost:5432/Horizon_DB_test?schema=public
BCRYPT_SALT_ROUNDS=10
JWT_SECRET=test-secret-jwt-horizon-api-do-not-use-in-production
JWT_EXPIRES_IN=120000
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
# ... بقیه‌ی متغیرهای OTP/SMTP با مقادیر تستی
```

### ۴.۳ چرا `setupFiles` قبل از import فایل تست اجرا می‌شود؟ (نکته‌ی ظریف)

فایل `src/config/env.ts` هنگام **import** این کار را می‌کند:

```ts
import "dotenv/config";
const env = envSchema.parse(process.env); // اگر متغیرها نباشند، همان‌جا throw می‌کند
```

یعنی به‌محض اینکه یک ماژول (مثلاً `booking.service.ts`) import شود، `env.ts` هم import می‌شود و
`process.env` را با اسکیمای Zod پارس می‌کند. اگر متغیرها **قبل از** این import تنظیم نشده باشند،
تست با خطای پارس env می‌ترکد.

راه‌حل: `setupFiles` در Vitest **پیش از بارگذاری فایل تست** اجرا می‌شود؛ پس `load-env.ts` / `integration.setup.ts`
همان‌جا `.env.test` را با `dotenv` لود می‌کنند و `process.env` را پر می‌کنند. سپس وقتی فایل تست
ماژول‌های پروژه را import می‌کند، `env.ts` مقادیر درست را می‌بیند.

> **نکته‌ی dotenv:** `dotenv` به‌طور پیش‌فرض متغیرهای موجود را **override نمی‌کند**. بنابراین
> `import "dotenv/config"` داخل `env.ts` (که `.env` را می‌خواند) مقادیر `.env.test` را که setupFiles
> از قبل ست کرده‌اند، بازنویسی نمی‌کند. این ترتیب، دقیقاً همان چیزی است که می‌خواهیم: در تست، مقادیر
> `.env.test` برنده می‌شوند.

### ۴.۴ جدول متغیرهای کلیدی برای تست

| متغیر | مقدار تست | نقش در تست |
|--------|-----------|-------------|
| `NODE_ENV` | `test` | `database.ts` لاگ‌های query را در dev روشن می‌کند؛ در test فقط warn/error |
| `DATABASE_URL` | `.../Horizon_DB_test` | دیتابیس تست؛ **باید شامل «test» باشد** (محافظ بخش ۵.۳) |
| `JWT_SECRET` | رشته‌ی جعلی | امضای توکن در `tests/helpers/auth.ts` |
| `JWT_EXPIRES_IN` | `120000` | عمر توکن در تست‌های HTTP |
| `BCRYPT_SALT_ROUNDS` | `10` | سرعت هش در ساخت کاربر تستی |
| `SUPABASE_*` | مقادیر تستی | فقط برای رضایت اسکیمای env (آپلود در تست انجام نمی‌شود) |
| `OTP_*` / `SMTP_*` | مقادیر تستی/خالی | فقط برای رضایت اسکیمای env |

---

## ۵. پوشه‌ی `tests/setup/`

این پوشه زیرساختِ اجرا است: بارگذاری env، محافظ دیتابیس، ساخت دیتابیس، و آماده‌سازی global.

### ۵.۱ `tests/setup/load-env.ts`

```ts
config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
process.env.NODE_ENV = "test";
```

**نقش:** `setupFiles` پروژه‌ی **unit**. فقط `.env.test` را لود می‌کند تا وقتی `config/env.ts`
import می‌شود، اسکیمای Zod با موفقیت پارس شود. **هیچ دیتابیسی نمی‌سازد** — تست‌های unit دیتابیس ندارند.

### ۵.۲ `tests/setup/integration.setup.ts`

```ts
config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
process.env.NODE_ENV = "test";
export const TEST_DB_NAME = parseDatabaseName(process.env.DATABASE_URL);
assertTestDatabase(process.env.DATABASE_URL); // هارد-فِیل اگر نام DB شامل test نباشد
```

**نقش:** `setupFiles` پروژه‌ی **integration**. علاوه بر لود env، نام دیتابیس را همان‌جا اعتبارسنجی
می‌کند تا اگر کسی `DATABASE_URL` را به دیتابیس غیرتست بدهد، قبل از هر اتصال متوقف شود.

### ۵.۳ `tests/setup/db-guard.ts` — محافظ دیتابیس (قاعده‌ی طلایی)

```ts
export function assertTestDatabase(databaseUrl: string | undefined): string {
  const name = parseDatabaseName(databaseUrl);
  if (!name) throw new Error("[tests] DATABASE_URL is missing or invalid...");
  if (!/test/i.test(name))
    throw new Error(`[tests] Refusing to run against database "${name}": the database name must contain "test". ...`);
  return name;
}
```

**چرا وجود دارد؟** پاک‌سازی تست‌های integration با `TRUNCATE ... CASCADE` انجام می‌شود که **مخرب** است.
اگر اشتباهاً به دیتابیس dev/production اشاره کند، تمام داده نابود می‌شود. این محافظ نام دیتابیس را
بررسی می‌کند و در صورت نبود «test»، با پیام واضح هارد-فِیل می‌کند. این محافظ در **سه جا** صدا زده می‌شود:
`integration.setup.ts`، `global-setup.ts` و `create-test-db.ts` — یعنی یک لایه‌ی دفاعی چندمرحله‌ای.

### ۵.۴ `tests/setup/global-setup.ts` — آماده‌سازی global پروژه‌ی integration

```ts
export default async function globalSetup(): Promise<void> {
  config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
  process.env.NODE_ENV = "test";

  const databaseUrl = process.env.DATABASE_URL;
  assertTestDatabase(databaseUrl);            // ۱. محافظ نام DB

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();                    // ۲. تست اتصال
    await client.query("SELECT 1");
  } catch (error) {
    process.env.TEST_DB_AVAILABLE = "false";   // ۳. اگر در دسترس نبود → skip تمیز
    writeFileSync(DB_STATUS_FILE, "false", "utf8");
    console.warn(`... integration tests will be SKIPPED ...`);
    await client.end().catch(() => undefined);
    return;
  }

  await client.end();
  process.env.TEST_DB_AVAILABLE = "true";
  writeFileSync(DB_STATUS_FILE, "true", "utf8");  // ۴. نوشتن فایل علامت

  execFileSync("npx", ["prisma", "migrate", "deploy"], {  // ۵. اعمال migrationها
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
    shell: process.platform === "win32",
  });
}
```

**چه کاری می‌کند (به‌ترتیب):**

1. `.env.test` را لود و نام دیتابیس را با guard بررسی می‌کند.
2. یک اتصال خام با `pg.Client` می‌گیرد و `SELECT 1` می‌زند تا مطمئن شود دیتابیس بالاست.
3. **اگر دیتابیس در دسترس نبود:** فایل علامت را `false` می‌نویسد، هشدار واضح چاپ می‌کند و برمی‌گردد.
   نتیجه: تست‌های integration به‌صورت تمیز **skip** می‌شوند (تست‌های unit آسیب نمی‌بینند).
4. **اگر در دسترس بود:** فایل علامت را `true` می‌نویسد.
5. `prisma migrate deploy` را روی دیتابیس تست اجرا می‌کند تا اسکیمای واقعی — شامل
   exclusion constraint دست‌نویس و CHECK constraint — اعمال شود.

**نکته‌ی ظریف درباره‌ی ارتباط بین پروسه‌ها:** `globalSetup` در یک **پروسه‌ی جدا** از فایل‌های تست
اجرا می‌شود؛ بنابراین `process.env.TEST_DB_AVAILABLE` که اینجا ست می‌شود به فایل تست نمی‌رسد.
به همین دلیل از یک **فایل علامت** (`.db-available`) استفاده می‌شود که هر دو طرف آن را می‌بینند
(خواندن در `tests/helpers/integration.ts`).

### ۵.۵ `tests/setup/create-test-db.ts` — ساخت دیتابیس تست (یک‌بار)

اجرا با: `npm run test:db:setup`

```ts
async function main(): Promise<void> {
  config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
  const databaseUrl = process.env.DATABASE_URL;
  const dbName = parseDatabaseName(databaseUrl);
  if (!dbName || !/test/i.test(dbName)) throw new Error(`Refusing to create database "${dbName}"...`);

  const adminUrl = new URL(databaseUrl);   // اتصال به دیتابیس postgres برای CREATE
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();

  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);   // idempotent
  }
  await client.end();
}
```

**نحوه‌ی ساخت دیتابیس تست به‌طور کامل:**

1. `.env.test` خوانده می‌شود تا `DATABASE_URL` تست به دست آید.
2. نام دیتابیس باید شامل «test» باشد، وگرنه متوقف می‌شود.
3. برای اجرای `CREATE DATABASE` (که نمی‌تواند داخل تراکنش/دیتابیس هدف باشد)، به دیتابیس `postgres`
   وصل می‌شود و وجود دیتابیس را با `pg_database` بررسی می‌کند (idempotent — اجرای دوباره خطا نمی‌دهد).
4. اگر وجود نداشت، `CREATE DATABASE "Horizon_DB_test"` را اجرا می‌کند.
5. **اعمال migrationها:** خودِ اسکریپت migration نمی‌زند؛ پیام می‌دهد که یا `globalSetup` هنگام اجرای
   تست این کار را خودکار انجام می‌دهد، یا دستی:

   ```bash
   DATABASE_URL="postgresql://postgres:1234@localhost:5432/Horizon_DB_test?schema=public" \
     npx prisma migrate deploy
   ```

**معادل دستی کامل (اگر اسکریپت را ترجیح نمی‌دهید):**

```bash
# ۱. ساخت دیتابیس
psql -h localhost -U postgres -c 'CREATE DATABASE "Horizon_DB_test";'
# ۲. اعمال migrationها
DATABASE_URL="postgresql://postgres:1234@localhost:5432/Horizon_DB_test?schema=public" npx prisma migrate deploy
```

### ۵.۶ `tests/setup/.db-available` (فایل علامت)

فایل متنی حاوی `"true"` یا `"false"` که `global-setup.ts` می‌نویسد و `tests/helpers/integration.ts`
می‌خواند. در `.gitignore` ثبت شده (`tests/setup/.db-available`) چون artifact زمان اجراست.

---

## ۶. پوشه‌ی `tests/helpers/`

ابزارهای مشترک. فلسفه‌ی این پوشه: **هیچ تستی نباید داده را دستی بسازد یا منطق تکراری داشته باشد.**

### ۶.۱ `tests/helpers/factories.ts`

سازنده‌های داده‌ی تست با override‌پذیری کامل:

| factory | توضیح |
|---------|-------|
| `createUser({ role, email, active, withGuest, fullName })` | کاربر می‌سازد؛ برای نقش `guest` به‌طور پیش‌فرض پروفایل Guest هم می‌سازد |
| `createCabin({ name, maxCapacity, regularPrice, cityId })` | Region→City→Cabin را خودکار می‌سازد |
| `createPriceRule({ cabinId, type, kind, percent, startDate, endDate, weekdays, actorId })` | قاعده‌ی قیمت‌گذاری برای تست‌های pricing |
| `createCabinDailyPrice({ cabinId, date, basePrice, discountPercent, surchargePercent, finalPrice })` | درج مستقیم ردیف تقویم قیمت |
| `createRegion(name?)` / `createCity(regionId?)` | ساخت زنجیره‌ی مکانی |
| `createBooking({ cabinId, guestId, startDate, endDate, status, paymentDeadline, ... })` | ساخت مستقیم رزرو در DB (برای تست‌های repository/route) |
| `utcDate("YYYY-MM-DD")` | ساخت `Date` نیمه‌شب UTC |

- **`nextId()`:** یک شمارنده‌ی یکتا برای پرهیز از تداخل فیلدهای unique (email/name/slug).
- **`DEFAULT_PASSWORD = "TestPassword123!"`:** رمز پیش‌فرض کاربران تستی.
- **نکته‌ی مهم:** `createUser` رمز را **plaintext** می‌دهد و خودش هش نمی‌کند؛ چون
  `src/config/database.ts` یک `$extends` دارد که روی `user.create`/`user.update` رمز را با bcrypt
  هش می‌کند. یعنی factory از همان مسیر production استفاده می‌کند.
- **هشدار fixture:** به‌خاطر exclusion constraint دیتابیس، فراخوانی‌های `createBooking` روی **یک کابین**
  باید بازه‌های **غیرهم‌پوشان** (یا وضعیت غیرفعال مثل `cancelled`) داشته باشند، وگرنه با `23P01` رد می‌شوند.

### ۶.۲ `tests/helpers/auth.ts`

```ts
export function tokenFor(user) { return signToken(user.id, user.role); }
export function cookieFor(user) { return `jwt=${tokenFor(user)}`; }
```

**چرا کوکی و نه هدر Authorization؟** middleware `protect` توکن را از کوکی `jwt` می‌خواند
(نه `Authorization: Bearer`). پس تست‌های HTTP باید توکن را به‌صورت کوکی بفرستند:
`.set("Cookie", cookieFor(guest))`.

### ۶.۳ `tests/helpers/db.ts`

```ts
const TRUNCATABLE_TABLES = ["bookings","guests","users","cabins","cities","regions","settings","verification_codes"] as const;

export async function resetDatabase(): Promise<void> {
  const tableList = TRUNCATABLE_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}
export async function disconnectDatabase(): Promise<void> { await prisma.$disconnect(); }
```

**چرا `TRUNCATE ... RESTART IDENTITY CASCADE`؟**

- `TRUNCATE` سریع‌تر از `DELETE` است و همه‌ی ردیف‌ها را پاک می‌کند.
- `RESTART IDENTITY` شمارنده‌ی id را ریست می‌کند تا تست‌ها به idهای تکرارپذیر تکیه کنند.
- `CASCADE` ترتیب حذف را حل می‌کند (نیازی به حذف دستی روابط نیست).
- **لیست جدول‌ها صریح است** تا اگر جدول جدیدی اضافه شد، آگاهانه به لیست اضافه شود (نه اینکه خودکار و پنهان پاک شود).

### ۶.۴ `tests/helpers/integration.ts`

```ts
export function isIntegrationDbAvailable(): boolean {
  // فایل علامت را می‌خواند؛ در نبود آن محافظه‌کارانه false
  if (!existsSync(DB_STATUS_FILE)) return false;
  return readFileSync(DB_STATUS_FILE, "utf8").trim() === "true";
}
export function useIntegrationDb(): IntegrationHooks {
  const available = isIntegrationDbAvailable();
  beforeAll(async () => { if (available) await resetDatabase(); });
  afterAll(async () => { if (available) await disconnectDatabase().catch(() => undefined); });
  return { db: prisma, available };
}
```

- `isIntegrationDbAvailable()` در زمان **collect** (قبل از `beforeAll`) اجرا می‌شود، پس می‌توان با
  `describe.skipIf(!isIntegrationDbAvailable())` کل فایل را تمیز skip کرد.
- `useIntegrationDb()` یک hook مشترک است که TRUNCATE قبل از فایل و disconnect بعد از آن را انجام می‌دهد.

### ۶.۵ `tests/helpers/app.ts`

```ts
let app: Express | null = null;
export function getTestApp(): Express { if (!app) app = createApp(); return app; }
export const API_BASE = "/api/v1";
export const BOOKINGS_PATH = `${API_BASE}/bookings`;
```

**چرا `createApp()` جدا از `listen`؟** چون `src/app.ts` و `src/server.ts` جدا هستند، می‌توان بدون باز
کردن پورت واقعی، app را به supertest داد. `getTestApp()` یک نمونه‌ی singleton می‌سازد.

### ۶.۶ `tests/helpers/db-availability.ts`

یک بررسی reachability با `prisma.$queryRaw\`SELECT 1\`` و کش کردن نتیجه. مکمل `integration.ts` است
(تشخیص زمان‌اجرایی به‌جای فایل علامت) و `resetDatabaseReachabilityCache()` برای ریست کش بین فایل‌ها.

---

## ۷. پوشه‌ی `tests/unit/`

تست‌های سریع، بدون دیتابیس. repositoryها mock می‌شوند. زمان با fake timer قطعی می‌شود.

### ۷.۱ `tests/unit/utils/date.util.test.ts` — ۱۶ تست

**هدف:** توابع خالص تاریخ در `src/utils/date.util.ts` که ستون فقرات قوانین رزرو‌اند (امروزِ کابین،
تعداد شب، افزودن روز). این توابع باید مستقل از timezone سرور و ایمن در برابر DST باشند.

**دلیل انتخاب تست‌ها:** خطا در این توابع مستقیماً به رزرو غلط یا قیمت غلط منجر می‌شود؛ پس مرزها
(دقیقاً قبل/بعد نیمه‌شب تهران، آفست منفی، روز کبیسه، عدم mutation) تست می‌شوند.

| گروه | نمونه سناریو | ورودی → خروجی |
|------|---------------|----------------|
| `todayInTimezone` | تبدیل به نیمه‌شب UTC «امروز» در `Asia/Tehran` | `2026-10-03T20:30Z` → `2026-10-04T00:00Z` |
| `todayInTimezone` | آفست منفی (New York) | `2026-10-03T02:00Z` → `2026-10-02T00:00Z` |
| `nightsBetween` | امن در برابر DST (هر دو نیمه‌شب UTC) | `2026-03-28`..`03-31` → `3` |
| `nightsBetween` | پایان قبل از شروع | → `-2` |
| `addDaysUtc` | غلت ماه/سال، روز منفی، عدم mutation | `06-28`+۵ → `07-03` |
| `addDaysUtc` | روز کبیسه | `2024-02-28`+۱ → `02-29` |
| `addDaysUtc` | استقلال از timezone سرور | `2026-01-01T23:30Z`+۳۶۵ → `2027-01-01T23:30Z` |

### ۷.۲ `tests/unit/utils/transaction.util.test.ts` — ۸ تست

**هدف:** تابع `withSerializableRetry` در `src/utils/transaction.util.ts` — قلب مقاوم‌سازی تراکنش.
این تابع فقط خطای `P2034` (write conflict در `SERIALIZABLE`) را با backoff تصادفی ۵۰–۱۰۰ms دوباره
تلاش می‌کند و هر خطای دیگر را بلافاصله پرتاب می‌کند.

**دلیل انتخاب:** retry زیاد = کندی/پنهان‌کردن خطا؛ retry کم = شکست تراکنش در ترافیک. باید دقیقاً
اثبات شود که فقط `P2034` retry می‌شود و کران‌های backoff رعایت می‌شوند.

| سناریو | انتظار |
|--------|--------|
| موفقیت در تلاش اول | ۱ فراخوانی |
| `P2034` سپس موفقیت | ۲ فراخوانی، مقدار بازیابی‌شده |
| اتمام retryها با `P2034` (`retries=2`) | ۳ فراخوانی، همان خطا |
| `retries=0` | ۱ تلاش |
| خطای غیر P2034 (`P2002`) / `Error` / `AppError` | بدون retry، ۱ فراخوانی |
| کران‌های backoff | در ۴۹ms هنوز retry نشده، در ۱۰۰ms انجام شده |

> **جزئیات فنی:** تست‌ها برای پرهیز از unhandled rejection، یک helper `withHandler()` دارند که
> handler را **بلافاصله** به promise می‌چسباند و بعد `vi.advanceTimersByTimeAsync` صدا زده می‌شود.

### ۷.۳ `tests/unit/utils/booking-price.util.test.ts` — ۶ تست

**هدف:** helperهای پول در `src/utils/booking-price.util.ts` (`sumNightPrices`, `fitsInt32`).

**دلیل انتخاب:** جمع قیمت شب‌های یک اقامت باید از سرریز `Int32` (ستون `totalPrice`) محافظت شود؛
در صورت سرریز باید `null` برگردد تا سرویس خطای واضح بدهد، نه عدد نادرست.

| سناریو | ورودی → خروجی |
|--------|----------------|
| جمع قیمت شب‌ها | `[1e6, 1e6, 1e6]` → `3000000` |
| لیست خالی | `[]` → `0` |
| سرریز Int32 | `[MAX_INT32, 1]` → `null` |
| کرانه‌ی دقیقاً MAX | `[MAX_INT32]` → `MAX_INT32` |
| `fitsInt32` بازه‌ی معتبر | `0`, `MAX_INT32` → `true` |
| `fitsInt32` نامعتبر | `MAX_INT32+1`, `-1`, `1.5` → `false` |

### ۷.۴ `tests/unit/utils/booking.util.test.ts` — ۳۱ تست

**هدف:** `isValidStatusTransition` و `hasFullBookingAccess` در `src/utils/booking.util.ts`.

**دلیل انتخاب:** ماشین وضعیت رزرو قلب دامنه است؛ هر ترنزیشن مجاز/غیرمجاز باید دقیق باشد. به‌جای
لیست‌کردن دستی، **ماتریس کامل ۵×۵** (همه‌ی ۲۵ ترکیب) تست می‌شود تا هیچ ترکیبی جا نماند.

| گروه | پوشش |
|------|------|
| ترنزیشن‌های مجاز (۴) | `pending→cancelled`, `confirmed→checkedIn`, `confirmed→cancelled`, `checkedIn→checkedOut` |
| ماتریس کامل ۲۵تایی | هر ترکیب خارج از لیست مجاز → `false` |
| وضعیت‌های terminal | `cancelled` و `checkedOut` هیچ خروجی ندارند |
| ترنزیشن به خود | مجاز نیست |
| `hasFullBookingAccess` | `admin`/`owner` → `true`، `guest` → `false` |

### ۷.۵ `tests/unit/validations/booking.validation.test.ts` — ۴۱ تست

**هدف:** اسکیم‌های Zod در `src/validations/booking.validation.ts` (`createBookingSchema`,
`listBookingsQueryValidation`, `updateBookingStatusSchema`, `bookedDatesSchema`, `getBookingSchema`).

**دلیل انتخاب:** اعتبارسنجی اولین خط دفاعی است؛ ورودی بد باید همان‌جا با پیام روشن رد شود. اسکیماها روی
enum تولیدی Prisma (`BookingStatus`) بنا شده‌اند، نه لیست دستی؛ پس اگر enum تغییر کند، تست‌ها آن را آینه می‌کنند.

نمونه‌ی پوشش: تبدیل `YYYY-MM-DD` به `Date` نیمه‌شب UTC؛ رد تاریخ ناموجود (`2026-02-30`)، ماه ۱۳،
ISO datetime کامل و ماه یک‌رقمی؛ coerce رشته‌ی عددی؛ سقف ۲۰۰۰ کاراکتری `observations` و trim؛
پیش‌فرض‌های pagination؛ وضعیت‌های مجاز/غیرمجاز؛ refine بازه‌ی `bookedDates` (`from > to` رد،
دقیقاً روی سقف قبول، بیشتر از سقف رد)؛ و coerce شناسه‌ها.

### ۷.۶ `tests/unit/services/booking.service.test.ts` — ۶۱ تست

**هدف:** منطق سرویس در `src/services/booking.service.ts` با **mock کردن** repositoryها و
`prisma.$transaction`. زمان با `vi.setSystemTime(NOW)` (`NOW = 2026-06-15T12:00:00Z`) قطعی می‌شود.

**دلیل انتخاب:** سرویس جایی است که قوانین دامنه به‌هم گره می‌خورند (بررسی تاریخ، ظرفیت، هم‌پوشانی،
سقف pending، مهلت پرداخت، ترنزیشن). mock کردن repositoryها باعث می‌شود هر سناریو سریع، قطعی و
مستقل از دیتابیس باشد و بتوان مسیرهای خطا (مثل `confirmPendingBooking → false`) را دقیق ساخت.

پوشش به‌تفکیک تابع:

- **`createBooking`** — قیمت/شب/مهلت درست؛ نبود مهمان (۴۰۳)؛ تاریخ گذشته (۴۰۰)؛ امروزِ کابین قبول؛
  سقف `MAX_ADVANCE_BOOKING_DAYS`؛ `numNights` کران‌ها؛ کابین ناموجود (۴۰۴)؛ ظرفیت مهمان؛
  هم‌پوشانی (۴۰۹)؛ سقف pending (۴۰۹)؛ ترتیب مراحل (`expire→overlap→pending→create`)؛
  **یک `now` واحد** (همان نمونه‌ی `Date`، نه فقط هم‌مقدار)؛ retry روی `P2034`؛ عدم retry خطای غیر P2034.
- **`getAllBookings`** — عبور فیلترها برای admin/owner؛ اجبار `guestUserId=userId` برای مهمان؛
  اولویت فیلتر مهمان؛ متای pagination.
- **`getBookingById`** — ۴۰۴/۴۰۳/دسترسی admin؛ **شکل پاسخ بدون `guest.userId`** (از `findBookingById`).
- **`payBooking`** — تأیید با `paidAt=NOW`؛ ۴۰۹ رزرو غیر pending؛ ۴۰۹ مهلت گذشته؛
  **مرز انحصاری `paymentDeadline === now` = منقضی**؛ `confirmPendingBooking=false`؛ شکل پاسخ.
- **`cancelBooking`** — لغو با `userCancelled`؛ ۴۰۳؛ رد رزرو غیر pending؛ `cancelPendingBooking=false`.
- **`updateBookingStatus`** — `confirmed→checkedIn`؛ `checkedIn→checkedOut`؛ ترنزیشن نامعتبر (۴۰۰)؛
  ثبت `cancelledAt`/`adminCancelled`؛ **رد check-in قبل از تاریخ شروع (۴۰۰)**؛ check-in روی دقیقاً
  تاریخ شروع؛ **عدم چک زمانی در check-out**؛ `transitionBookingStatus=false` (۴۰۹)؛ شکل پاسخ.
- **`expirePendingBookings`** — پاس‌دادن یک `now`.
- **`getBookedDates`** — پیش‌فرض `from`/`to`؛ سقف بازه؛ ۴۰۴ کابین؛ map خروجی.

---

## ۸. پوشه‌ی `tests/integration/`

تست‌های کندتر روی دیتابیس واقعی. هر فایل با `describe.skipIf(!isIntegrationDbAvailable())` محافظت
شده و قبل از هر تست جدول‌ها TRUNCATE می‌شوند.

### ۸.۱ `tests/integration/repositories/booking.repository.test.ts`

**هدف:** لایه‌ی repository روی PostgreSQL واقعی — جایی که کوئری‌های Prisma، filterها، relationها و
**constraintهای دیتابیس** آزمایش می‌شوند.

**دلیل انتخاب:** بخشی از رفتار (مثل exclusion constraint، `TRUNCATE`-safe بودن کوئری‌ها، ترتیب
`orderBy`، رفتار relation) فقط با DB واقعی قابل اثبات است؛ mock کردن Prisma این لایه را بی‌معنا می‌کند.

| گروه | پوشش |
|------|------|
| `findAllBookings` | فیلتر status/cabinId/guestId/`guestUserId`/بازه‌ی تاریخ؛ ترکیب فیلترها؛ pagination؛ ترتیب نزولی `createdAt`؛ خلاصه‌ی cabin/guest **بدون `userId`** |
| `findBookingById` / `findBookingWithOwnerById` | اولی **`userId` ندارد**، دومی **دارد**؛ هر دو برای id ناموجود `null` |
| `hasOverlappingBooking` | هم‌پوشانی؛ بازه‌ی مجاور = آزاد؛ کابین دیگر؛ نادیده‌گرفتن cancelled/checkedOut؛ pending منقضی/غیرمنقضی؛ checkedIn؛ بازه‌ی دربرگیرنده و داخل |
| `findBookedDateRanges` | بیرون‌زدن از `to`؛ حذف قبل/بعد از بازه؛ ترتیب صعودی؛ حذف pending منقضی |
| `countPendingBookingsForGuest` | شمارش فقط pending منقضی‌نشده‌ی همان مهمان |
| `confirmPendingBooking` | تأیید قبل از مهلت؛ رد بعد از مهلت (بدون تغییر ردیف)؛ رد غیر pending؛ **پیروزی فقط یکی از دو confirm هم‌زمان** |
| `cancelPendingBooking` | لغو با ثبت فیلدها؛ رد غیر pending |
| `transitionBookingStatus` | ترنزیشن مطابق/نامطابق؛ ثبت فیلدهای لغو |
| `expirePendingBookings` | انقضای `deadline <= now`؛ مرز `lte`؛ محدودسازی به یک کابین |
| **`database constraints`** | exclusion (هم‌پوشان فعال رد، مجاور قبول، لغو/checkedOut/کابین دیگر قبول)؛ CHECK (`end <= start` رد) |

> این فایل همچنین **مستندات واقعی کدهای خطای constraint** را در خود دارد (بخش ۹.۲).

### ۸.۲ `tests/integration/routes/booking.routes.test.ts`

**هدف:** تست end-to-end مسیرهای `/api/v1/bookings` با **supertest** و app واقعی، احراز هویت با کوکی JWT.
نقش‌ها: `guest`, `otherGuest`, `admin`, `owner`.

**دلیل انتخاب:** این تنها لایه‌ای است که کل زنجیره را می‌سنجد: routing → middleware (auth/validate) →
controller → service → repository → DB → شکل پاسخ. تست‌های HTTP تضمین می‌کنند که status code،
کد خطا و shape پاسخ (مثل عدم افشای `userId`) درست است.

| endpoint | پوشش |
|----------|------|
| `POST /bookings` | ۴۰۱ بدون لاگین؛ ۴۰۰ body نامعتبر با شکل `{status:"fail",code:"VALIDATION_ERROR",errors}`؛ ساخت ۲۰۱؛ عدم افشای `userId`؛ ۴۰۰ تاریخ گذشته؛ ۴۰۹ هم‌پوشانی؛ **موفقیت روی pending منقضی + لغو آن در همان تراکنش**؛ ۴۰۴ کابین؛ ۴۰۰ سقف ۳۶۵ روز |
| `GET /bookings` | نیاز به auth؛ دید admin/owner؛ scope مهمان؛ **عدم امکان گسترش scope با `guestId`** (مستند باگ)؛ عدم افشای `userId`؛ فیلتر status؛ pagination |
| `GET /bookings/:id` | ۴۰۱؛ ۴۰۰ id غیرعددی؛ ۴۰۴ ناموجود؛ صاحب/admin؛ ۴۰۳ مهمان دیگر؛ عدم افشای `userId` |
| `POST /bookings/:id/pay` | ۴۰۱؛ پرداخت ۲۰۰؛ ۴۰۳؛ ۴۰۹ لغوشده؛ ۴۰۹ `BOOKING_EXPIRED` |
| `POST /bookings/:id/cancel` | ۴۰۱؛ لغو ۲۰۰؛ ۴۰۳؛ ۴۰۹ `BOOKING_CANNOT_CANCEL` |
| `PATCH /bookings/:id/status` | ۴۰۱؛ ۴۰۳؛ ۴۰۰ وضعیت غیرقابل‌به‌روزرسانی؛ check-in موفق؛ **۴۰۰ check-in قبل از شروع**؛ لغو با `adminCancelled`؛ ۴۰۰ ترنزیشن نامعتبر |
| `GET /bookings/cabin/:cabinId/booked-dates` | ۴۰۱؛ بازه‌ها؛ ۴۰۰ سقف؛ ۴۰۰ `from>to`؛ ۴۰۴ کابین؛ بازه‌ی معتبر |

### ۸.۳ `tests/integration/jobs/booking-expiration.test.ts`

**هدف:** منطق handler انقضای رزرو — همان تابعی که cron هر دقیقه صدا می‌زند (`expirePendingBookings`).
خودِ cron زمان‌بندی نمی‌شود؛ فقط **منطق** انقضا با DB واقعی تست می‌شود.

**دلیل انتخاب:** انقضای رزرو پرداخت‌نشده یک فرایند پس‌زمینه‌ی مخرب است (status را تغییر می‌دهد)؛
باید مطمئن شویم فقط pendingهای منقضی را لمس می‌کند و idempotent است.

| سناریو | انتظار |
|--------|--------|
| لغو pendingهای منقضی و دست‌نزدن به بقیه | `expired=1`؛ شمارش نهایی pending:1/confirmed:1/checkedIn:1/cancelled:1 |
| ثبت دلیل لغو | `cancellationReason="paymentExpired"` |
| Idempotency | اجرای اول `1`، دوم `0` |

### ۸.۴ `tests/integration/services/booking.concurrency.test.ts`

**هدف:** تست **هم‌زمانی واقعی** در سطح سرویس: چند درخواست موازی روی یک بازه، با تراکنش `SERIALIZABLE`
و `withSerializableRetry`.

**دلیل انتخاب:** صحت منطق هم‌زمانی **فقط** با DB واقعی قابل اثبات است. هدف: وقتی N درخواست یک بازه‌ی
یکسان را هم‌زمان رزرو می‌کنند، دقیقاً یکی موفق شود و بقیه با **۴۰۹** برگردند — نه ۵۰۰، نه خطای خام.

| سناریو | انتظار |
|--------|--------|
| ۵ رزرو هم‌زمان یک بازه | دقیقاً یکی موفق؛ بقیه `AppError` با `409` و کد در `{BOOKING_DATE_OVERLAP, TRANSACTION_CONFLICT}`؛ فقط ۱ رزرو در DB |
| ۲ رزرو هم‌زمان همان مهمان | دقیقاً یکی موفق؛ بقیه ۴۰۹ |
| ۲ رزرو هم‌زمانِ جدا (disjoint) | هر دو موفق؛ ۲ رزرو |
| فعال‌شدن exclusion constraint | **هیچ ۵۰۰/خطای خام Prisma لو نرود**؛ همه `AppError` با `statusCode < 500` |

> **جزئیات فنی:** این تست از helper `futureRange(offsetDays, nights)` استفاده می‌کند تا تاریخ‌ها
> near-future باشند و سقف `MAX_ADVANCE_BOOKING_DAYS` را رد نکنند؛ و از چند مهمانِ جدا استفاده می‌کند
> تا سقف `MAX_PENDING_BOOKINGS_PER_GUEST` سناریو را خراب نکند.

---

## ۹. استراتژی کلی، کنوانسیون‌ها و یافته‌های واقعی

### ۹.۱ کنوانسیون‌های کدنویسی تست

| موضوع | قاعده |
|-------|-------|
| import | ESM با پسوند `.js` (مثل کد production) |
| رشته‌ها | double quote؛ عرض خط ۱۰۰ (Prettier) |
| زبان `describe`/`it` | انگلیسی (هم‌راستا با پیام‌های خطا) |
| کامنت | فارسی |
| داده‌ی تست | فقط از factory؛ هرگز کپی دستی ردیف |
| زمان | `vi.useFakeTimers()` + `vi.setSystemTime()` در تست‌های وابسته به زمان |
| استقلال | هر تست مستقل؛ پاک‌سازی در `beforeEach` (integration) |
| retry در تست | `retries=2` یعنی ۳ تلاش کل؛ تست‌ها این عدد را صریح assert می‌کنند |

### ۹.۲ یافته‌ی مهم: کدهای خطای constraint در Prisma 7 + adapter-pg

در Prisma 7 با `@prisma/adapter-pg`، **هر دو** نقض constraint (هم exclusion با SQLSTATE `23P01` و هم
CHECK با `23514`) از Prisma با کد **`P2039`** برمی‌گردند؛ SQLSTATE اصلی در
`err.meta.driverAdapterError.cause.originalCode` قرار دارد.

**پیامد:** middleware مدیریت خطا برای تشخیص نوع نقض constraint باید روی `P2039` + `originalCode`
کلید بزند، نه مستقیماً روی `23P01`. این واقعیت در `booking.repository.test.ts` → `database constraints`
به‌صورت اجرایی مستند شده است.

### ۹.۳ باگ‌ها و ناسازگاری‌های مستندشده (بدون اصلاح، طبق قواعد)

1. **باگ فیلتر `guestId` در `getAllBookings`:** scope مهمان به‌صورت `{ ...filters, guestUserId: userId }`
   اعمال می‌شود. اگر مهمان `?guestId=N` بفرستد، `guestId` با `guestUserId` هم AND می‌شود و نتیجه خالی
   برمی‌گردد. **نشت اطلاعاتی نیست** (رزرو دیگران برنمی‌گردد)، اما رفتار اشتباه است؛ فیلتر باید نادیده
   گرفته یا override شود. *(مستند در `booking.routes.test.ts`)*
2. **ناسازگاری شکل پاسخ `POST /bookings`:** `repository.createBooking` ردیف خام (بدون relation)
   برمی‌گرداند، پس پاسخ create آبجکت `guest` ندارد، در حالی که getById/pay/cancel شامل
   `guest: { id, fullName }` اند. نشت نیست، فقط شکل پاسخ ناهمگون است.

### ۹.۴ نکات اجرایی مهم

- **تست‌های integration ترتیبی‌اند** (`fileParallelism: false`) چون روی یک DB مشترک TRUNCATE می‌کنند.
- **در نبود دیتابیس، integration به‌صورت تمیز skip می‌شود** و unit آسیب نمی‌بیند (فایل علامت + `skipIf`).
- **محافظ نام دیتابیس در سه نقطه** اجرا می‌شود تا TRUNCATE هرگز به DB غیرتست نرسد.
- **fixture gotcha:** روی یک کابین، بازه‌های رزرو فعال باید غیرهم‌پوشان باشند.
- **Postgres محلی (ویندوز):** باینری‌ها در `C:\Program Files\PostgreSQL\18\bin`؛ برای `psql`/`pg_isready` باید در PATH باشند.

---

## ۱۰. اجرای محلی و CI

### ۱۰.۱ پیش‌نیازها

- Node.js >= 21
- PostgreSQL در حال اجرا (فقط برای integration)

```bash
npm install
npm run prisma:generate   # در صورت نیاز
```

### ۱۰.۲ دستورها

```bash
npm run test               # unit (پیش‌فرض، سریع، بدون DB)
npm run test:unit          # unit
npm run test:watch         # unit در حالت watch
npm run test:coverage      # unit + گزارش coverage
npm run test:integration   # integration (نیازمند DB تست)
npm run test:db:setup      # ساخت دیتابیس تست (یک‌بار)
```

### ۱۰.۳ راه‌اندازی دیتابیس تست (یک‌بار)

```bash
npm run test:db:setup
# یا دستی:
psql -h localhost -U postgres -c 'CREATE DATABASE "Horizon_DB_test";'
DATABASE_URL="postgresql://postgres:1234@localhost:5432/Horizon_DB_test?schema=public" npx prisma migrate deploy
```

> هنگام اجرای `npm run test:integration`، خودِ `globalSetup` این migration را خودکار انجام می‌دهد.

### ۱۰.۴ بررسی خروجی

- Vitest خلاصه‌ی `Test Files` و `Tests` را چاپ می‌کند (مثلاً `Tests 167 passed (167)`).
- اجرای یک فایل:
  ```bash
  npx vitest run --config vitest.unit.config.ts tests/unit/services/booking.service.test.ts
  ```
- فیلتر بر اساس نام:
  ```bash
  npx vitest run --config vitest.unit.config.ts -t "should reject a past start date"
  ```
- گزارش coverage در `coverage/` (HTML) تولید می‌شود.

### ۱۰.۵ GitHub Actions

پروژه در حال حاضر پوشه‌ی `.github/` ندارد؛ workflow پیشنهادی زیر را در
`.github/workflows/ci.yml` بسازید:

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
env:
  NODE_VERSION: "22"
jobs:
  unit:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: npm }
      - run: npm ci
      - run: npm run prisma:generate
      - run: npm run test:unit
  integration:
    name: Integration tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: 1234
          POSTGRES_DB: Horizon_DB_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:1234@localhost:5432/Horizon_DB_test?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: npm }
      - run: npm ci
      - run: npm run prisma:generate
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: "${{ env.DATABASE_URL }}" }
      - run: npm run test:integration
        env: { DATABASE_URL: "${{ env.DATABASE_URL }}" }
```

- **Triggerها:** push/PR روی `main` و `develop`؛ `concurrency` اجراهای قدیمی را لغو می‌کند.
- **نام DB در CI:** حتماً شامل `test` (`Horizon_DB_test`)، وگرنه guard هارد-فِیل می‌کند.
- **مشاهده‌ی نتایج:** تب **Actions** → اجرای `CI` → job → step؛ وضعیت شِک‌ها کنار PR؛ دکمه‌ی **Re-run jobs** برای اجرای مجدد.

---

## پیوست: درخت کامل فایل‌ها

```
tests/
├── setup/
│   ├── load-env.ts              # setup پروژه unit — فقط بارگذاری .env.test
│   ├── integration.setup.ts     # setup پروژه integration — env + بررسی نام DB
│   ├── db-guard.ts              # محافظ نام دیتابیس (باید شامل "test" باشد)
│   ├── global-setup.ts          # بررسی دسترسی DB + نوشتن فایل علامت + prisma migrate deploy
│   ├── create-test-db.ts        # اسکریپت ساخت دیتابیس تست (npm run test:db:setup)
│   └── .db-available            # فایل علامت وضعیت DB (gitignore شده)
├── helpers/
│   ├── factories.ts             # createUser/createCabin/createRegion/createCity/createBooking/utcDate
│   ├── auth.ts                  # tokenFor/cookieFor/authCookieHeader/bearerToken
│   ├── db.ts                    # resetDatabase (TRUNCATE) / disconnectDatabase
│   ├── integration.ts           # isIntegrationDbAvailable / useIntegrationDb
│   ├── db-availability.ts       # isDatabaseReachable (SELECT 1 + کش)
│   └── app.ts                   # getTestApp / API_BASE / BOOKINGS_PATH
├── unit/
│   ├── utils/
│   │   ├── date.util.test.ts
│   │   ├── transaction.util.test.ts
│   │   ├── booking-price.util.test.ts
│   │   └── booking.util.test.ts
│   ├── validations/
│   │   └── booking.validation.test.ts
│   └── services/
│       └── booking.service.test.ts
└── integration/
    ├── repositories/
    │   └── booking.repository.test.ts
    ├── routes/
    │   └── booking.routes.test.ts
    ├── jobs/
    │   └── booking-expiration.test.ts
    └── services/
        └── booking.concurrency.test.ts
```

**فایل‌های پیکربندی مرتبط:** `vitest.config.ts`، `vitest.unit.config.ts`، `vitest.integration.config.ts`،
`.env.test` (commit شده)، و بخش `scripts` در `package.json`.

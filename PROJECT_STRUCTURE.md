# The Horizon Cabins — Project Structure

پروژه API بک‌اند The Horizon Cabins؛ یک سرویس REST برای مدیریت اقامتگاه‌ها (cabins)، دسته‌بندی‌ها، کاربران و احراز هویت. ساخته‌شده با Express 5 + TypeScript + Prisma 7 و دیتابیس PostgreSQL.

## تکنولوژی‌ها

| تکنولوژی | توضیح |
|---|---|
| Express 5 | فریم‌ورک وب |
| TypeScript | تایپ‌سیفت |
| Prisma 7 | ORM با Driver Adapter |
| PostgreSQL | دیتابیس (از طریق `@prisma/adapter-pg`) |
| Zod | اعتبارسنجی داده |
| JWT | احراز هویت (در Cookie) |
| Winston | لاگ‌گیری |
| Multer | آپلود فایل (به Supabase Storage) |

## ساختار پوشه‌ها

```
the-horizon-cabins-API-TS/
├── prisma/                       # مدل‌ها و مایگریشن‌های Prisma
│   ├── schema.prisma             # تعریف مدل‌های دیتابیس
│   ├── seed.ts                   # اسکریپت seed اصلی دیتابیس
│   ├── migrations/               # فایل‌های مایگریشن
│   └── seeds/                    # داده‌های seed و اسکریپت‌های کمکی
├── src/
│   ├── app.ts                    # ساخت اپلیکیشن Express و تنظیم middlewareها
│   ├── server.ts                 # نقطه ورود؛ شروع سرور و مدیریت graceful shutdown
│   ├── config/                   # تنظیمات پروژه
│   │   ├── env.ts                # خواندن و اعتبارسنجی متغیرهای محیطی
│   │   ├── database.ts           # اتصال Prisma و تنظیمات اتصال به DB
│   │   └── logger.ts             # تنظیمات لاگر Winston
│   ├── constants/                # مقادیر ثابت پروژه
│   │   ├── errorCodes.ts         # کدهای خطای یکتا
│   │   ├── httpStatus.ts         # وضعیت‌های HTTP
│   │   ├── categoryIcons.ts      # آیکون‌های مجاز دسته‌بندی
│   │   └── upload.constants.ts   # تنظیمات آپلود تصویر
│   ├── controllers/              # کنترلرها — پردازش ورودی و خروجی
│   │   ├── auth.controller.ts    # لاگین، ثبت‌نام و لاگ‌اوت
│   │   ├── cabin.controller.ts   # CRUD اقامتگاه‌ها
│   │   ├── category.controller.ts # CRUD دسته‌بندی‌ها
│   │   └── user.controller.ts    # پروفایل کاربر
│   ├── middlewares/              # middlewareهای Express
│   │   ├── auth.middleware.ts    # احراز هویت (JWT) و بررسی نقش
│   │   ├── validate.middleware.ts # اعتبارسنجی Zod روی body/params/query
│   │   ├── upload.middleware.ts  # آپلود تصویر با Multer
│   │   ├── pagination.middleware.ts # استخراج پارامترهای صفحه‌بندی
│   │   ├── errorHandler.middleware.ts # مدیریت مرکزی خطاها
│   │   └── notFound.middleware.ts # مدیریت مسیرهای نامعتبر
│   ├── repositories/             # لایه دسترسی به دیتابیس (Prisma)
│   │   ├── cabin.repository.ts   # کوئری‌های اقامتگاه
│   │   ├── category.repository.ts # کوئری‌های دسته‌بندی
│   │   ├── user.repository.ts    # کوئری‌های کاربر
│   │   ├── guest.repository.ts   # کوئری‌های مهمان
│   │   └── setting.repository.ts # کوئری‌های تنظیمات
│   ├── routes/                   # تعریف مسیرها
│   │   ├── index.ts              # فایل اصلی روتینگ
│   │   ├── auth.route.ts         # مسیرهای احراز هویت
│   │   ├── cabin.route.ts        # مسیرهای اقامتگاه
│   │   ├── category.route.ts     # مسیرهای دسته‌بندی
│   │   └── user.route.ts         # مسیرهای کاربر
│   ├── services/                 # لایه منطق کسب‌وکار
│   │   ├── auth.service.ts       # منطق لاگین، ثبت‌نام و توکن
│   │   ├── cabin.service.ts      # منطق CRUD اقامتگاه
│   │   ├── category.service.ts   # منطق CRUD دسته‌بندی
│   │   ├── user.service.ts       # منطق کاربر و تلاش ورود
│   │   └── guest.service.ts      # منطق مهمان
│   ├── types/                    # تایپ‌های TypeScript
│   │   ├── cabin.types.ts        # تایپ‌های مرتبط با اقامتگاه
│   │   ├── category.types.ts     # تایپ‌های مرتبط با دسته‌بندی
│   │   ├── user.types.ts         # تایپ‌های مرتبط با کاربر
│   │   ├── pagination.types.ts   # تایپ‌های صفحه‌بندی
│   │   └── express.d.ts          # توسعه تایپ Express
│   ├── utils/                    # توابع کمکی
│   │   ├── apiResponse.ts        # پاسخ موفقیت‌آمیز یکتا
│   │   ├── AppError.ts           # کلاس خطای سفارشی
│   │   ├── jwt.utils.ts          # ساخت و تأیید JWT
│   │   ├── password.utils.ts     # هش و مقایسه رمز عبور
│   │   ├── upload.utils.ts       # آپلود/حذف تصویر در Supabase
│   │   ├── pagination.utils.ts   # محاسبات صفحه‌بندی
│   │   ├── format.util.ts        # ابزارهای فرمت (اعداد فارسی و...)
│   │   ├── safeArray.ts          # تبدیل امن به آرایه
│   │   ├── safeParseNumber.ts    # پارس امن عدد
│   │   └── valid-icons.util.ts   # بررسی اعتبار آیکون
│   └── validations/              # اسکیمای اعتبارسنجی Zod
│       ├── auth.validation.ts    # اعتبارسنجی لاگین/ثبت‌نام
│       ├── cabin.validation.ts   # اعتبارسنجی اقامتگاه
│       ├── category.validation.ts # اعتبارسنجی دسته‌بندی
│       └── pagination.validation.ts # اعتبارسنجی صفحه‌بندی
├── .env                          # متغیرهای محیطی (گمانی)
├── .env.example                  # نمونه متغیرهای محیطی
├── package.json                  # وابستگی‌ها و اسکریپت‌ها
├── tsconfig.json                 # تنظیمات TypeScript
├── tsconfig.build.json           # تنظیمات TypeScript برای بیلد
├── eslint.config.ts              # تنظیمات ESLint
└── prisma7.config.ts             # تنظیمات Prisma 7
```

## جریان درخواست (Request Flow)

```
Request → app.ts → routes/ → middlewares → controllers → services → repositories → DB
```

1. **app.ts** — middlewareهای اصلی (JSON، Cookie Parser، مسیرها، مدیریت خطا)
2. **routes/** — تعریف مسیرها و اتصال به کنترلرها
3. **middlewares/** — اعتبارسنجی، احراز هویت، آپلود و صفحه‌بندی
4. **controllers/** — دریافت درخواست، صدا زدن سرویس، ارسال پاسخ
5. **services/** — منطق کسب‌وکار و اعتبارسنجی سطح دامنه
6. **repositories/** — اجرای کوئری‌های Prisma
7. **Prisma Client** — دسترسی به PostgreSQL

## اجرای پروژه

```bash
# نصب وابستگی‌ها
npm install

# تنظیم متغیرهای محیطی
cp .env.example .env

# اجرای در حالت توسعه
npm run dev

# بیلد
npm run build

# اجرای production
npm start
```

## نکات مهم

- احراز هویت با **JWT در Cookie** (httpOnly)
- آپلود تصاویر مستقیم به **Supabase Storage** از طریق `fetch`
- اعتبارسنجی داده‌ها با **Zod**
- رمز عبور با **bcrypt** هش می‌شود
- تلاش ورود ناموفق محدود می‌شود (قفل حساب)
- پاسخ موفقیت‌آمیز با **apiResponse** یکتا است
- مدیریت خطا در یک نقطه مرکزی (**errorHandler.middleware**)

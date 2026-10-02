import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(9).max(15).default(10),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCK_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 1000),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 1000),
  JWT_COOKIE_EXPIRES_IN_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 1000),

  // 🆕 Supabase Storage
  SUPABASE_URL: z
    .string()
    .url({ message: "SUPABASE_URL must be a valid URL (https://xxxxx.supabase.co)" }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { message: "SUPABASE_SERVICE_ROLE_KEY is required" }),
  SUPABASE_BUCKET_CABINS: z.string().default("cabins"),

  // 🆕 Email / OTP (SMTP عبر Gmail)
  /// میزبان SMTP گوگل.
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  /// پورت SMTP — ۴۶۵ برای اتصال امن (SSL/TLS).
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  /// `true` برای اتصال امن از ابتدا (پورت ۴۶۵). با STARTTLS روی ۵۸۷ false بگذارید.
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  /// نام کاربری SMTP — آدرس کامل جیمیل (مثلاً you@gmail.com).
  SMTP_USER: z.string().default(""),
  /// رمز عبور برنامه‌ی جیمیل (App Password) — نه رمز اصلی حساب.
  SMTP_PASS: z.string().default(""),
  /// فرستنده‌ی ایمیل — نام نمایشی + آدرس. در جیمیل باید همان SMTP_USER باشد.
  SMTP_FROM: z.string().default("Horizon <no-reply@example.com>"),
  /// طول کد تایید (تعداد ارقام) — NIST حداقل ۶ رقم را الزام می‌کند.
  OTP_LENGTH: z.coerce.number().int().min(6).max(10).default(6),
  /// مدت اعتبار کد (ثانیه). پیش‌فرض ۲ دقیقه — هم‌راستا با فرانت.
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  /// سقف تلاش اشتباه روی یک کد پیش از باطل‌شدن.
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /// فاصله‌ی حداقلی بین دو ارسال به یک ایمیل (ثانیه).
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  /// سقف تعداد ارسال در بازه‌ی محدودیت نرخ.
  OTP_MAX_SENDS_PER_WINDOW: z.coerce.number().int().positive().default(5),
  /// طول بازه‌ی محدودیت نرخ ارسال (ساعت).
  OTP_RATE_LIMIT_WINDOW_HOURS: z.coerce.number().int().positive().default(1),
  /// مدت اعتبار توکن یک‌بارمصرف تایید ایمیل (ثانیه) — کوتاه، فقط برای ثبت‌نام.
  OTP_VERIFICATION_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
});

const env = envSchema.parse(process.env);

export default env;

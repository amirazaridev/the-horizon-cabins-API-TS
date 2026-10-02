import env from "../config/env.js";

/**
 * ثابت‌های دامنه‌ی OTP — تک‌منبع حقیقت برای همه‌ی مقادیر.
 *
 * ⚠️ چرا از `env` می‌خوانیم و نه هاردکد؟
 * این مقادیر سیاست امنیتی‌اند و باید بدون تغییر کد قابل تنظیم باشند
 * (مثلاً در staging عمر کد را کوتاه‌تر کنیم). ضمناً فرانت هم باید همین
 * مقادیر را از پاسخ API بگیرد تا تایمر ارسال مجدد با سرور هم‌داستان بماند.
 */
export const OTP_POLICY = {
  /** طول کد تایید (تعداد ارقام). */
  length: env.OTP_LENGTH,
  /** مدت اعتبار کد به ثانیه. */
  ttlSeconds: env.OTP_TTL_SECONDS,
  /** سقف تلاش اشتباه روی یک کد. */
  maxAttempts: env.OTP_MAX_ATTEMPTS,
  /** فاصله‌ی حداقلی ارسال مجدد به یک ایمیل (ثانیه). */
  resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  /** سقف ارسال در هر بازه. */
  maxSendsPerWindow: env.OTP_MAX_SENDS_PER_WINDOW,
  /** طول بازه‌ی محدودیت نرخ (ساعت). */
  rateLimitWindowHours: env.OTP_RATE_LIMIT_WINDOW_HOURS,
  /** مدت اعتبار توکن تایید ایمیل (ثانیه). */
  verificationTokenTtlSeconds: env.OTP_VERIFICATION_TOKEN_TTL_SECONDS,
} as const;

/** شبکه‌ی امنیتی: حتی اگر env خراب باشد، این مقادیر از حد پایین‌تر نمی‌آیند. */
export const OTP_HARD_LIMITS = {
  minLength: 6,
  minTtlSeconds: 60,
  maxAttemptsCeiling: 10,
} as const;

/**
 * هدف‌های مجاز OTP که از بیرون قابل درخواست‌اند.
 * عمداً یک enum محلی است تا لایه‌ی API به enum تولیدشده‌ی Prisma وابسته نشود.
 */
export const OTP_PURPOSES = ["signup", "passwordReset", "login"] as const;
export type OtpPurposeType = (typeof OTP_PURPOSES)[number];

/**
 * برچسب قابل‌نمایش هر هدف — برای خط‌مشی ایمیل.
 * اینجا نگه داشته می‌شود تا متن ایمیل و منطق دامنه یک‌جا بمانند.
 */
export const OTP_PURPOSE_LABELS: Record<OtpPurposeType, string> = {
  signup: "تایید ایمیل",
  passwordReset: "بازیابی رمز عبور",
  login: "ورود به حساب",
};

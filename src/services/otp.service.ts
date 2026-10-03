import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { OTP_POLICY, type OtpPurposeType } from "../constants/otp.constants.js";
import {
  compareCode,
  generateNumericCode,
  generateVerificationToken,
  hashCode,
  hashToken,
} from "../utils/otp.utils.js";
import { buildOtpEmail } from "../utils/otp-email.template.js";
import * as otpRepository from "../repositories/otp.repository.js";
import * as mailService from "./mail.service.js";
import logger from "../config/logger.js";
import { OtpPurpose } from "../generated/prisma/enums.js";

/**
 * سرویس کد تایید (OTP).
 *
 * این لایه همه‌ی تصمیم‌های دامنه را می‌گیرد و به هیچ صراط مستقیم با
 * Prisma یا SMTP حرف نمی‌زند؛ از ریپازیتوری و mail.service استفاده
 * می‌کند. کنترلر فقط ورودی/خروجی HTTP را می‌شناسد.
 *
 * ⚠️ اصول امنیتی رعایت‌شده (طبق NIST 800-63B):
 *  1. کد با CSPRNG تولید می‌شود (`crypto.randomInt`)، نه `Math.random`.
 *  2. کد فقط به‌صورت هش bcrypt ذخیره می‌شود.
 *  3. عمر کوتاه (پیش‌فرض ۲ دقیقه) و یک‌بارمصرف.
 *  4. سقف تلاش اشتباه؛ با رسیدن به سقف، کد باطل می‌شود.
 *  5. cooldown ارسال مجدد + سقف ارسال در بازه (محدودیت نرخ).
 *  6. در هر لحظه فقط یک کد معتبر (کدهای قبلی باطل می‌شوند).
 *  7. بعد از verify، یک توکن یک‌بارمصرف کوتاه‌عمر برای ثبت‌نام صادر می‌شود.
 */

const APP_NAME = "The Horizon Cabins";

/** نگاشت هدف دامنه به enum Prisma — مرز واحد، بدون تکرار در لایه‌ها. */
const PURPOSE_MAP: Record<OtpPurposeType, OtpPurpose> = {
  signup: OtpPurpose.signup,
  passwordReset: OtpPurpose.passwordReset,
  login: OtpPurpose.login,
};

export type RequestOtpResult = {
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

export type VerifyOtpResult = {
  /** توکن یک‌بارمصرف برای تکمیل ثبت‌نام در `signup`. */
  verificationToken: string;
  /** عمر توکن به ثانیه — فرانت برای UX می‌تواند نشان دهد. */
  verificationTokenExpiresInSeconds: number;
};

/**
 * مقادیر زمانی سیاست OTP — برای پاسخ‌های عمومی که نباید افشا کنند
 * آیا ایمیلی ارسال شده یا نه (defense در برابر email enumeration).
 */
export function getOtpTiming(): RequestOtpResult {
  return {
    expiresInSeconds: OTP_POLICY.ttlSeconds,
    resendAfterSeconds: OTP_POLICY.resendCooldownSeconds,
  };
}

/* ------------------------------------------------------------------ */
/* ارسال کد                                                            */
/* ------------------------------------------------------------------ */

/**
 * صدور و ارسال کد جدید.
 *
 * ترتیب بررسی‌ها عمدی است:
 *  ۱. محدودیت نرخ بلندمدت (سقف ارسال در بازه) → جلوتر از همه، چون
 *     گران‌ترین سوءاستفاده (spam) را می‌بندد.
 *  ۲. cooldown کوتاه‌مدت → جلوگیری از کلیک پشت‌سرهم کاربر واقعی.
 *  ۳. صدور کد جدید و باطل‌کردن کدهای قبلی.
 */
export async function requestOtp(
  email: string,
  purposeType: OtpPurposeType,
): Promise<RequestOtpResult> {
  const purpose = PURPOSE_MAP[purposeType];
  const now = new Date();

  await enforceSendRateLimit(email, purpose, now);

  await otpRepository.revokePendingVerificationCodes(email, purpose);

  const code = generateNumericCode(OTP_POLICY.length);
  const expiresAt = new Date(now.getTime() + OTP_POLICY.ttlSeconds * 1000);
  const codeHash = await hashCode(code);

  // ⚠️ فقط در توسعه: چاپ کد تا توسعه‌دهنده بدون دسترسی به ایمیل واقعی
  // بتواند جریان را تست کند. در production هرگز لاگ نمی‌شود.
  if (process.env.NODE_ENV !== "production") {
    logger.debug(`[OTP:dev] کد تایید برای ${email}: ${code}`);
  }

  const record = await otpRepository.createVerificationCode({
    email,
    purpose,
    codeHash,
    maxAttempts: OTP_POLICY.maxAttempts,
    expiresAt,
  });

  const { subject, html, text } = buildOtpEmail({
    code,
    purpose: purposeType,
    ttlMinutes: Math.max(1, Math.round(OTP_POLICY.ttlSeconds / 60)),
    appName: APP_NAME,
  });

  try {
    await mailService.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  } catch (error) {
    // اگر ایمیل نرفت، کد نباید «در انتظار» بماند؛ وگرنه کاربر بی‌کد گیر
    // می‌کند و فضای محدودیت نرخ هم بی‌دلیل مصرف می‌شود.
    await otpRepository.revokeVerificationCode(record.id);
    logger.warn("OTP email failed; code revoked", { email, purpose: purposeType });
    throw error;
  }

  return {
    expiresInSeconds: OTP_POLICY.ttlSeconds,
    resendAfterSeconds: OTP_POLICY.resendCooldownSeconds,
  };
}

/* ------------------------------------------------------------------ */
/* بررسی کد                                                            */
/* ------------------------------------------------------------------ */

/**
 * بررسی کد واردشده و صدور توکن تایید.
 *
 * خطاها تفکیک شده‌اند تا هم UX بهتر باشد و هم شمارش تلاش درست بماند:
 *  - کد منقضی → خطای expiry، **بدون** مصرف تلاش (طبق best practice).
 *  - کد نادرست → یک تلاش کم می‌شود؛ اگر به سقف رسید کد باطل می‌شود.
 *  - کد درست → مصرف و صدور توکن در یک عملیات.
 */
export async function verifyOtp(
  email: string,
  purposeType: OtpPurposeType,
  code: string,
): Promise<VerifyOtpResult> {
  const purpose = PURPOSE_MAP[purposeType];
  const now = new Date();

  const record = await otpRepository.findActiveVerificationCode(email, purpose, now);

  if (!record) {
    // یا کدی صادر نشده، یا منقضی شده. برای امنیت پیام یکسان می‌دهیم
    // و از کاربر می‌خواهیم کد جدید بگیرد.
    await markExpiredIfNeeded(email, purpose, now);
    throw new AppError(
      "The verification code has expired or does not exist. Please request a new one.",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.OTP_EXPIRED,
    );
  }

  const isMatch = await compareCode(code, record.codeHash);

  if (!isMatch) {
    const updated = await otpRepository.registerFailedAttempt(record.id, record.maxAttempts);
    const remaining = Math.max(0, record.maxAttempts - updated.attempts);
    const isLocked = updated.attempts >= record.maxAttempts;

    throw new AppError(
      isLocked
        ? "Too many incorrect attempts. Please request a new code."
        : `Incorrect code. You have ${remaining} attempt(s) remaining.`,
      HTTP_STATUS.BAD_REQUEST,
      isLocked ? ErrorCode.OTP_MAX_ATTEMPTS : ErrorCode.OTP_INVALID,
    );
  }

  // ✅ کد درست — مصرف و صدور توکن یک‌بارمصرف.
  const verificationToken = generateVerificationToken();
  const verificationTokenHash = hashToken(verificationToken);
  const verificationExpiresAt = new Date(
    now.getTime() + OTP_POLICY.verificationTokenTtlSeconds * 1000,
  );

  await otpRepository.consumeVerificationCode(
    record.id,
    verificationTokenHash,
    verificationExpiresAt,
  );

  return {
    verificationToken,
    verificationTokenExpiresInSeconds: OTP_POLICY.verificationTokenTtlSeconds,
  };
}

/* ------------------------------------------------------------------ */
/* مصرف توکن تایید (برای زنجیره‌ی signup)                                */
/* ------------------------------------------------------------------ */

/**
 * اعتبارسنجی توکن تایید صادرشده در `verifyOtp`.
 *
 * در `auth.service.signup` قبل از ساخت حساب صدا زده می‌شود. اگر توکن
 * معتبر نباشد، ثبت‌نام رد می‌شود ⇒ هیچ‌کس نمی‌تواند با دور زدن مرحله‌ی
 * تایید ایمیل، حساب بسازد.
 *
 * @returns شناسه‌ی رکورد کد — تا پس از ساخت حساب بتوانیم توکن را بسوزانیم.
 */
export async function consumeVerificationToken(
  email: string,
  purposeType: OtpPurposeType,
  token: string,
): Promise<{ recordId: number }> {
  const purpose = PURPOSE_MAP[purposeType];
  const now = new Date();
  const tokenHash = hashToken(token);

  const record = await otpRepository.findValidVerificationToken(tokenHash, purpose, now);

  if (!record || record.email !== email) {
    throw new AppError(
      "Email verification is required. Please verify your email first.",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.VERIFICATION_REQUIRED,
    );
  }

  return { recordId: record.id };
}

/** ابطال توکن تایید بعد از استفاده — توکن یک‌بارمصرف است. */
export async function invalidateVerificationToken(recordId: number): Promise<void> {
  await otpRepository.revokeVerificationToken(recordId);
}

/* ------------------------------------------------------------------ */
/* کمکی‌های داخلی                                                      */
/* ------------------------------------------------------------------ */

/** محدودیت نرخ ارسال: سقف در بازه + cooldown بین دو ارسال. */
async function enforceSendRateLimit(email: string, purpose: OtpPurpose, now: Date): Promise<void> {
  const windowStart = new Date(now.getTime() - OTP_POLICY.rateLimitWindowHours * 60 * 60 * 1000);

  const sendsInWindow = await otpRepository.countVerificationCodesSince(
    email,
    purpose,
    windowStart,
  );

  if (sendsInWindow >= OTP_POLICY.maxSendsPerWindow) {
    throw new AppError(
      "Too many verification codes requested. Please try again later.",
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ErrorCode.OTP_RATE_LIMITED,
    );
  }

  const latest = await otpRepository.findLatestVerificationCode(email, purpose);
  if (latest) {
    const elapsedMs = now.getTime() - latest.createdAt.getTime();
    const cooldownMs = OTP_POLICY.resendCooldownSeconds * 1000;
    if (elapsedMs < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${waitSeconds} second(s) before requesting a new code.`,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        ErrorCode.OTP_RESEND_TOO_SOON,
      );
    }
  }
}

/**
 * اگر کد pending قدیمی منقضی شده، وضعیتش را به expired تغییر می‌دهد.
 * صرفاً برای پاکیزگی داده؛ رفتار کاربر را عوض نمی‌کند.
 */
async function markExpiredIfNeeded(email: string, purpose: OtpPurpose, now: Date): Promise<void> {
  const latest = await otpRepository.findLatestVerificationCode(email, purpose);
  if (latest && latest.status === "pending" && latest.expiresAt <= now) {
    await otpRepository.revokePendingVerificationCodes(email, purpose);
  }
}

/** برای جاب پاک‌سازی: جمع‌آوری کدهای قدیمی. */
export async function cleanupExpiredOtpRecords(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return otpRepository.deleteExpiredVerificationCodes(cutoff);
}

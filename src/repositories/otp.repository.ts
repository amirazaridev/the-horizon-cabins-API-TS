import { prisma } from "../config/database.js";
import type { Prisma, VerificationCode } from "../generated/prisma/client.js";
import { OtpPurpose, OtpStatus } from "../generated/prisma/enums.js";

/**
 * ریپازیتوری کدهای تایید (OTP).
 *
 * ⚠️ لایه‌ی ریپازیتوری فقط با Prisma حرف می‌زند؛ هیچ منطق دامنه‌ای
 * (تولید کد، سیاست انقضا، تصمیم خطا) اینجا نیست. تصمیم‌ها در
 * `otp.service.ts` گرفته می‌شوند. این مرز همان الگوی پروژه است
 * (user.repository فقط کوئری می‌زند، auth.service تصمیم می‌گیرد).
 */

/** داده‌ی لازم برای درج یک کد تازه — بدون فیلدهای خودکار Prisma. */
export type CreateVerificationCodeData = {
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  maxAttempts: number;
  expiresAt: Date;
};

export async function createVerificationCode(
  data: CreateVerificationCodeData,
): Promise<VerificationCode> {
  return prisma.verificationCode.create({ data });
}

/**
 * آخرین کد فعال (pending و منقضی‌نشده) برای یک ایمیل و هدف.
 * برای بررسی کد ارسال‌شده توسط کاربر استفاده می‌شود.
 */
export async function findActiveVerificationCode(
  email: string,
  purpose: OtpPurpose,
  now: Date,
): Promise<VerificationCode | null> {
  return prisma.verificationCode.findFirst({
    where: {
      email,
      purpose,
      status: OtpStatus.pending,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** آخرین کد صادرشده برای یک ایمیل و هدف، بدون توجه به وضعیت. */
export async function findLatestVerificationCode(
  email: string,
  purpose: OtpPurpose,
): Promise<VerificationCode | null> {
  return prisma.verificationCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });
}

/** شمارش ارسال‌های یک ایمیل در بازه‌ی زمانی مشخص — مبنای محدودیت نرخ. */
export async function countVerificationCodesSince(
  email: string,
  purpose: OtpPurpose,
  since: Date,
): Promise<number> {
  return prisma.verificationCode.count({
    where: { email, purpose, createdAt: { gte: since } },
  });
}

/**
 * باطل‌کردن همه‌ی کدهای pending یک ایمیل/هدف.
 * هنگام صدور کد جدید فراخوانی می‌شود تا هر لحظه فقط یک کد معتبر باشد
 * (سطح حدس را دو برابر نمی‌کنیم و replay-resistance حفظ می‌شود).
 */
export async function revokePendingVerificationCodes(
  email: string,
  purpose: OtpPurpose,
): Promise<number> {
  const result = await prisma.verificationCode.updateMany({
    where: { email, purpose, status: OtpStatus.pending },
    data: { status: OtpStatus.revoked },
  });
  return result.count;
}

/** ثبت یک تلاش اشتباه؛ اگر به سقف رسید، کد باطل می‌شود. */
export async function registerFailedAttempt(
  id: number,
  maxAttempts: number,
): Promise<VerificationCode> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.verificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });

    if (current.attempts >= maxAttempts) {
      return tx.verificationCode.update({
        where: { id },
        data: { status: OtpStatus.revoked },
      });
    }

    return current;
  });
}

/**
 * مصرف کد و صدور توکن تایید در یک تراکنش.
 * ⭐ اتمیک بودن مهم است: اگر بین «مصرف کد» و «ثبت توکن» خطایی رخ دهد،
 * نباید کدی سوخته باشد که توکنی برایش صادر نشده.
 */
export async function consumeVerificationCode(
  id: number,
  verificationTokenHash: string,
  verificationExpiresAt: Date,
): Promise<VerificationCode> {
  return prisma.verificationCode.update({
    where: { id },
    data: {
      status: OtpStatus.consumed,
      consumedAt: new Date(),
      verificationTokenHash,
      verificationExpiresAt,
    },
  });
}

/** واکشی یک توکن تایید مصرف‌شده و معتبر (برای زنجیره‌ی signup). */
export async function findValidVerificationToken(
  tokenHash: string,
  purpose: OtpPurpose,
  now: Date,
): Promise<VerificationCode | null> {
  return prisma.verificationCode.findFirst({
    where: {
      verificationTokenHash: tokenHash,
      purpose,
      status: OtpStatus.consumed,
      verificationExpiresAt: { gt: now },
    },
  });
}

/** ابطال توکن تایید بعد از استفاده در signup (تا دوباره قابل استفاده نباشد). */
export async function revokeVerificationToken(id: number): Promise<void> {
  await prisma.verificationCode.update({
    where: { id },
    data: { verificationTokenHash: null, verificationExpiresAt: null },
  });
}

/**
 * ابطال یک کد مشخص (آن را به وضعیت `revoked` می‌برد).
 * هنگام شکست ارسال ایمیل استفاده می‌شود تا کدی که کاربر هرگز ندیده،
 * در حالت «در انتظار» نماند و فضای درخواست را اشغال نکند.
 */
export async function revokeVerificationCode(id: number): Promise<void> {
  await prisma.verificationCode.update({
    where: { id },
    data: { status: OtpStatus.revoked },
  });
}

/** حذف ردیف‌های قدیمی/منقضی — برای جاب دوره‌ای پاک‌سازی. */
export async function deleteExpiredVerificationCodes(before: Date): Promise<number> {
  const result = await prisma.verificationCode.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: before } }, { createdAt: { lt: before } }],
    },
  });
  return result.count;
}

/** تایپ کمکی برای مصرف در سرویس بدون وابستگی به جزئیات Prisma. */
export type VerificationCodeRecord = VerificationCode;
export type VerificationCodeCreateInput = Prisma.VerificationCodeCreateInput;

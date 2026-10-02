import nodemailer, { type Transporter, type SentMessageInfo } from "nodemailer";
import env from "../config/env.js";
import logger from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";

/**
 * سرویس ایمیل — بر پایه‌ی SMTP گوگل با `nodemailer`.
 *
 * ⚠️ نکات پیاده‌سازی:
 *  - `transporter` یک‌بار در سطح ماژول ساخته می‌شود و کانکشن‌ها را
 *    pool می‌کند؛ ساختن transporter در هر ارسال، handshake تازه‌ی
 *    TLS/STARTTLS و بار اضافه روی Gmail می‌آورد.
 *  - `nodemailer` برخلاف Resend در خطا **throw** می‌کند، پس اینجا
 *    try/catch لازم و درست است (و همان خطا نگاشت می‌شود به AppError).
 *  - مقادیر اتصال از env می‌آیند و هرگز هاردکد نمی‌شوند تا بتوان
 *    بدون تغییر کد بین محیط‌ها سوییچ کرد.
 */

/** transporter مشترک — lazy ساخته می‌شود تا در تست‌های بدون SMTP هم import امن باشد. */
let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // ۴۶۵ → true ، ۵۸۷ → false (STARTTLS)
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });

  return cachedTransporter;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** نسخه‌ی متنی ساده — برای کلاینت‌هایی که HTML را رندر نمی‌کنند. */
  text: string;
};

export type SendEmailResult = {
  /** شناسه‌ی پیام که سرور SMTP برگردانده (`messageId`). */
  id: string;
};

/**
 * ارسال ایمیل. در صورت شکست، `AppError` عملیاتی پرتاب می‌کند تا
 * لایه‌ی بالاتر پیام کاربرپسند بدهد و جزئیات در لاگ بماند.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  let info: SentMessageInfo;

  try {
    info = await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (error) {
    // ⚠️ رایج‌ترین خطاهای Gmail SMTP:
    //  - EAUTH / 535: نام کاربری یا App Password اشتباه است.
    //  - ETIMEDOUT / ECONNECTION: پورت/شبکه بسته است (۴۶۵ معمولاً بازتر از ۵۸۷).
    //  - 550 / sender rejected: `SMTP_FROM` با `SMTP_USER` یکی نیست.
    const detail = error instanceof Error ? error.message : String(error);
    logger.error(`SMTP failed to send email to ${input.to}: ${detail}`, {
      to: input.to,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      error,
    });
    throw new AppError(
      "Failed to send the verification email. Please try again.",
      HTTP_STATUS.BAD_GATEWAY,
      ErrorCode.OTP_EMAIL_SEND_FAILED,
    );
  }

  const messageId = info.messageId;

  if (!messageId) {
    logger.error("SMTP returned no message id", { to: input.to });
    throw new AppError(
      "Failed to send the verification email. Please try again.",
      HTTP_STATUS.BAD_GATEWAY,
      ErrorCode.OTP_EMAIL_SEND_FAILED,
    );
  }

  logger.info("Verification email sent", { to: input.to, messageId });
  return { id: messageId };
}

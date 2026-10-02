import { Resend } from "resend";
import env from "../config/env.js";
import logger from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";

/**
 * سرویس ایمیل — پوشش نازک روی Resend.
 *
 * ⚠️ طبق مستندات رسمی Resend:
 *  - `resend.emails.send()` هرگز برای خطای API throw نمی‌کند؛ یک شیء
 *    `{ data, error }` برمی‌گرداند. پس اینجا try/catch فقط برای خطاهای
 *    سطح شبکه (DNS، timeout) است.
 *  - کلید از env خوانده می‌شود و هرگز هاردکد نمی‌شود.
 *  - فرستنده از `MAIL_FROM` می‌آید تا در production به دامنه‌ی تاییدشده
 *    سوییچ کنیم بدون تغییر کد.
 */

const resend = new Resend(env.RESEND_API_KEY);

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** نسخه‌ی متنی ساده — برای کلاینت‌هایی که HTML را رندر نمی‌کنند. */
  text: string;
  /** کلید یکتای idempotency تا ارسال دوباره ایمیل تکراری نسازد. */
  idempotencyKey?: string;
};

/**
 * ارسال ایمیل. در صورت شکست، `AppError` عملیاتی پرتاب می‌کند تا
 * لایه‌ی بالاتر پیام کاربرپسند بدهد و جزئیات در لاگ بماند.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  let response: Awaited<ReturnType<typeof resend.emails.send>>;

  try {
    response = await resend.emails.send({
      from: env.MAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
  } catch (error) {
    // فقط خطای سطح شبکه به اینجا می‌رسد؛ خطای API در `response.error` است.
    logger.error("Resend network failure", { to: input.to, error });
    throw new AppError(
      "Email service is temporarily unavailable. Please try again.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      ErrorCode.OTP_EMAIL_SEND_FAILED,
    );
  }

  const { data, error } = response;

  if (error) {
    logger.error("Resend API rejected the email", { to: input.to, error });
    throw new AppError(
      "Failed to send the verification email. Please try again.",
      HTTP_STATUS.BAD_GATEWAY,
      ErrorCode.OTP_EMAIL_SEND_FAILED,
    );
  }

  if (!data?.id) {
    logger.error("Resend returned no email id", { to: input.to });
    throw new AppError(
      "Failed to send the verification email. Please try again.",
      HTTP_STATUS.BAD_GATEWAY,
      ErrorCode.OTP_EMAIL_SEND_FAILED,
    );
  }

  logger.info("Verification email sent", { to: input.to, emailId: data.id });
  return { id: data.id };
}

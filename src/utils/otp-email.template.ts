import { OTP_PURPOSE_LABELS, type OtpPurposeType } from "../constants/otp.constants.js";

/**
 * قالب ایمیل کد تایید.
 *
 * ⚠️ چرا HTML به‌صورت رشته و نه فایل جدا؟
 * قالب کوچک و ثابت است؛ نگه‌داشتنش در کد، تایپ‌سیف و بدون I/O فایل
 * می‌ماند. اگر روزی چند قالب شد، به پوشه‌ی `templates/` منتقل می‌شود.
 *
 * اصول UX ایمیل OTP:
 *  - کد باید بزرگ و با فاصله‌ی حروف باشد تا راحت خوانده شود.
 *  - زبان و جهت متن باید با مخاطب هماهنگ باشد (fa + RTL).
 *  - نسخه‌ی متنی ساده (text) برای کلاینت‌های بدون HTML.
 */

type BuildOtpEmailInput = {
  code: string;
  purpose: OtpPurposeType;
  ttlMinutes: number;
  appName: string;
};

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function buildOtpEmail({ code, purpose, ttlMinutes, appName }: BuildOtpEmailInput): EmailContent {
  const label = OTP_PURPOSE_LABELS[purpose];
  const subject = `${appName} — کد ${label}: ${code}`;

  const spacedCode = code.split("").join(" ");

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
  <body style="margin:0;padding:0;background:#f6f6f4;font-family:Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #ececea;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <h1 style="margin:0 0 8px;font-size:18px;color:#1c1c1a;">${appName}</h1>
                <p style="margin:0;font-size:14px;color:#55554f;line-height:1.9;">
                  سلام، برای ${label} از کد زیر استفاده کنید:
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 28px 4px;">
                <div style="display:inline-block;background:#faf9f6;border:1px dashed #d8d6cd;border-radius:12px;padding:16px 24px;">
                  <span style="font-size:30px;letter-spacing:6px;font-weight:bold;color:#1c1c1a;direction:ltr;display:inline-block;">${spacedCode}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px;">
                <p style="margin:0 0 8px;font-size:13px;color:#77776f;line-height:1.9;">
                  این کد تا ${ttlMinutes} دقیقه دیگر معتبر است و فقط یک‌بار قابل استفاده است.
                </p>
                <p style="margin:0;font-size:12px;color:#9a9a92;line-height:1.9;">
                  اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید؛ کد را با کسی به اشتراک نگذارید.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#a5a59d;">
            این پیام به‌صورت خودکار ارسال شده است.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${appName} — کد ${label}`,
    "",
    `کد شما: ${code}`,
    `این کد تا ${ttlMinutes} دقیقه معتبر است و فقط یک‌بار قابل استفاده است.`,
    "",
    "اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید.",
  ].join("\n");

  return { subject, html, text };
}

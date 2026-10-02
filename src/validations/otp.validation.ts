import { z } from "zod";
import { OTP_POLICY, OTP_PURPOSES } from "../constants/otp.constants.js";

/**
 * اسکیماهای اعتبارسنجی OTP.
 *
 * ⚠️ طول کد از `OTP_POLICY.length` می‌آید (که خودش از env می‌خواند)؛
 * پس اگر تعداد ارقام عوض شد، اعتبارسنجی هم خودکار هم‌راستا می‌شود و
 * عدد جادویی تکرار نمی‌شود.
 */

const emailField = z
  .string()
  .email({ message: "Must be a valid email address" })
  .toLowerCase()
  .trim();

const purposeField = z.enum(OTP_PURPOSES, {
  message: "Unsupported verification purpose",
});

const codeField = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_POLICY.length}}$`), {
    message: `Code must be exactly ${OTP_POLICY.length} digits`,
  });

const requestOtpBodySchema = z.object({
  email: emailField,
  purpose: purposeField.default("signup"),
});

const verifyOtpBodySchema = z.object({
  email: emailField,
  purpose: purposeField.default("signup"),
  code: codeField,
});

export const requestOtpSchema = {
  body: requestOtpBodySchema,
};

export const verifyOtpSchema = {
  body: verifyOtpBodySchema,
};

export type RequestOtpInput = z.infer<typeof requestOtpBodySchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpBodySchema>;

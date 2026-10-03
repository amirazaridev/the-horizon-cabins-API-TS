import type { Request, Response, NextFunction } from "express";
import * as otpService from "../services/otp.service.js";
import * as userRepository from "../repositories/user.repository.js";
import { sendSuccess } from "../utils/apiResponse.js";
import type { RequestOtpInput, VerifyOtpInput } from "../validations/otp.validation.js";

/**
 * کنترلر OTP — فقط ورودی/خروجی HTTP.
 * هیچ منطق دامنه‌ای اینجا نیست؛ همه در `otp.service.ts` است.
 */

/**
 * ارسال کد تایید.
 *
 * ⚠️ نکته‌ی امنیتی (email enumeration):
 * اگر برای هدف `signup` ایمیل از قبل ثبت شده باشد، به‌جای افشای
 * «این ایمیل ثبت شده»، همان پاسخ موفقیت‌آمیز عمومی برمی‌گردانیم و
 * ایمیلی نمی‌فرستیم. این کار از کشف وجود حساب‌ها توسط مهاجم جلوگیری
 * می‌کند. مقادیر زمانی از سیاست سرویس می‌آید تا پاسخ‌ها یکدست بمانند.
 */
export async function requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, purpose } = req.body as RequestOtpInput;

    if (purpose === "signup") {
      const existing = await userRepository.findUserByEmail(email);
      if (existing) {
        // پاسخ عیناً مثل حالت موفق، ولی بدون ارسال ایمیل.
        sendSuccess(res, {
          message: "If the address is eligible, a verification code has been sent.",
          data: otpService.getOtpTiming(),
        });
        return;
      }
    }

    const result = await otpService.requestOtp(email, purpose);
    sendSuccess(res, {
      message: "Verification code sent.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/** بررسی کد و صدور توکن یک‌بارمصرف تایید. */
export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, purpose, code } = req.body as VerifyOtpInput;
    const result = await otpService.verifyOtp(email, purpose, code);

    sendSuccess(res, {
      message: "Verification successful.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

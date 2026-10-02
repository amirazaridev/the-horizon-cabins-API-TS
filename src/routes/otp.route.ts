import { Router } from "express";
import * as otpController from "../controllers/otp.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { requestOtpSchema, verifyOtpSchema } from "../validations/otp.validation.js";

const router = Router();

/**
 * مسیرهای کد تایید.
 *
 * ⚠️ چرا زیر `auth` نیستند بلکه مسیر مستقل `/otp` دارند؟
 * OTP یک دامنه‌ی مستقل است (می‌تواند برای signup، passwordReset و
 * login استفاده شود). جدا نگه‌داشتنش یعنی `auth.route.ts` فقط ورود/ثبت‌نام
 * را می‌شناسد و توسعه‌ی هدف‌های جدید OTP به auth دست نمی‌زند.
 *
 * این مسیرها عمداً بدون `protect` هستند؛ کاربرِ بدون حساب هم باید
 * بتواند کد تایید ثبت‌نام را بگیرد. محافظت واقعی = محدودیت نرخ + سقف تلاش
 * که در سرویس اعمال می‌شود.
 */
router.post("/request", validate(requestOtpSchema), otpController.requestOtp);
router.post("/verify", validate(verifyOtpSchema), otpController.verifyOtp);

export default router;

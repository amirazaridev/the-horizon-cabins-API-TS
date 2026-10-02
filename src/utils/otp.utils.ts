import { randomInt, randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import env from "../config/env.js";

/**
 * ابزارهای رمزنگاری OTP — تولید کد امن و هش‌کردن.
 *
 * ⚠️ چرا `randomInt` و نه `Math.random`؟
 * `Math.random` قابل پیش‌بینی است و برای توکن‌های امنیتی مناسب نیست.
 * `crypto.randomInt` از منبع تصادفی امنِ سیستم تغذیه می‌شود.
 */

/**
 * تولید کد عددی با طول مشخص و توزیع یکنواخت.
 *
 * ⚠️ نکته‌ی مهم: از `randomInt` برای هر رقم استفاده می‌کنیم، نه یک
 * عدد تصادفی در بازه و سپس pad. رویکرد اخیر بایاس ایجاد می‌کند (اعدادی
 * که با صفر شروع می‌شوند کوتاه‌تر می‌شوند و فضای کد کوچک می‌شود).
 */
export function generateNumericCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/**
 * تولید توکن تصادفی چندبایتی برای مرحله‌ی تایید ایمیل.
 * این توکن یک‌بارمصرف است و فقط هشش ذخیره می‌شود.
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * هش‌کردن کد/توکن قبل از ذخیره.
 *
 * ⚠️ چرا bcrypt و نه sha256؟
 * کد ۶ رقمی فضای جست‌وجوی کوچکی دارد (۱ میلیون حالت). با sha256 ساده،
 * مهاجم با پایگاه‌داده‌ی لو رفته می‌تواند در چند ثانیه همه‌ی کدها را
 * brute-force کند. bcrypt با salt و کندی عمدی این را پرهزینه می‌کند.
 * این زیاده‌روی نیست؛ برای داده‌ی امنیتی کوتاه‌عمر لازم است.
 */
export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, env.BCRYPT_SALT_ROUNDS);
}

/** مقایسه‌ی کد ورودی با هش ذخیره‌شده (bcrypt خودش constant-time است). */
export async function compareCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/**
 * هش سریع توکن‌های پرآنتروپی (۲۵۶ بیت).
 *
 * ⚠️ چرا اینجا sha256 کافی است ولی برای کد نه؟
 * توکن ۳۲ بایتی فضای جست‌وجویی غیرقابل brute-force دارد، پس کندی bcrypt
 * مطلوب نیست (فقط هزینه اضافه در هر درخواست). برای کدهای کوتاه، bcrypt
 * لازم است. این تفکیک عمدی و امنیتی است.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

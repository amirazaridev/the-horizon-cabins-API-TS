/**
 * ابزارهای قیمت رزرو.
 *
 * ⚠️ قیمت شب‌ها دیگر با فرمول مستقل محاسبه نمی‌شود؛ تنها منبع حقیقت
 * `src/utils/pricing.engine.ts` است (P5). این ماژول فقط helperهای
 * عمومیِ مربوط به پول را نگه می‌دارد تا از تکرار فرمول جلوگیری شود.
 */

/** سقف ستون `totalPrice` (Int 32-bit). */
export const MAX_INT32 = 2_147_483_647;

/**
 * جمع قیمت شب‌ها؛ در صورت سرریز از محدوده‌ی Int 32-bit مقدار `null` برمی‌گرداند
 * تا فراخوان بتواند خطای واضح بدهد (به‌جای ذخیره‌ی عدد نادرست).
 */
export function sumNightPrices(nightlyPrices: number[]): number | null {
  let total = 0;
  for (const price of nightlyPrices) {
    total += price;
    if (total > MAX_INT32) return null;
  }
  return total;
}

/** آیا مقدار در محدوده‌ی Int 32-bit (ستون totalPrice) جا می‌شود؟ */
export function fitsInt32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_INT32;
}

// TODO(P8): پس از حذف کامل مسیر قدیمی، این helperهای مرده را پاک کن.
// فعلاً نگه داشته شده‌اند تا ارجاع‌های باقی‌مانده (در صورت وجود) نشکنند.
export function calculateCabinPrice(regularPrice: number, discount: number): number {
  const finalPrice = regularPrice - (regularPrice * discount) / 100;
  return Math.max(0, Math.floor(finalPrice));
}

export function calculateTotalPrice(cabinPrice: number, numNights: number): number {
  return cabinPrice * numNights;
}

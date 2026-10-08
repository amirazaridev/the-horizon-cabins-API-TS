/**
 * محاسبات سقف‌های قیمت‌گذاری — توابع pure و بدون I/O.
 *
 * جدا نگه داشته شده تا هم `pricing.constants` و هم لایه‌ی اعتبارسنجی بتوانند از
 * آن استفاده کنند بدون اینکه حلقه‌ی import ایجاد شود.
 */

/**
 * بیشترین `regularPrice` مجاز، طوری که حتی با اعمال حداکثر افزایش قیمت
 * (`surchargePercent`) هم قیمت نهایی از `maxNightlyPrice` عبور نکند.
 *
 * با ریاضی صحیح محاسبه می‌شود (بدون تقسیم اعشاری): floor(max * 100 / (100 + S)).
 */
export function deriveMaxRegularPrice(maxNightlyPrice: number, surchargePercent: number): number {
  return Math.floor((maxNightlyPrice * 100) / (100 + surchargePercent));
}

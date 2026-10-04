import { BOOKING_CONSTANTS } from "./booking.constants.js";
import type { PricingLimits } from "../types/pricing.types.js";

/**
 * ثابت‌های سیستم قیمت‌گذاری پویا.
 *
 * ⚠️ همه‌ی مقادیر از طریق `getPricingLimits()` خوانده می‌شوند (نه import مستقیم)،
 * تا وقتی بعداً به جدول `Setting` منتقل شدند، هیچ فراخوانی‌ای تغییر نکند.
 * در حال حاضر از حافظه خوانده می‌شوند؛ جدول `Setting` استفاده نمی‌شود.
 */

export const MAX_DISCOUNTS_PER_NIGHT = 2;
export const MAX_SURCHARGES_PER_NIGHT = 2;
export const MAX_TOTAL_DISCOUNT_PERCENT = 50;
export const MAX_TOTAL_SURCHARGE_PERCENT = 100;

/** سقف قیمت یک شب (تومان). */
export const MAX_NIGHTLY_PRICE = 70_000_000;

export const MIN_REGULAR_PRICE = 1_000_000;

/**
 * سقف `regularPrice` طوری مشتق می‌شود که حتی با حداکثر افزایش قیمت هم از
 * `MAX_NIGHTLY_PRICE` عبور نکند: floor(70_000_000 / 2) = 35_000_000.
 */
export const MAX_REGULAR_PRICE = Math.floor(
  MAX_NIGHTLY_PRICE / (1 + MAX_TOTAL_SURCHARGE_PERCENT / 100),
);

/** افق رزرو: از ۳۶۵ به ۱۲۰ روز کاهش می‌یابد (منبع حقیقت در booking.constants است). */
export const MAX_ADVANCE_BOOKING_DAYS = BOOKING_CONSTANTS.MAX_ADVANCE_BOOKING_DAYS;

/** افق تقویم قیمت = افق رزرو. */
export const PRICE_CALENDAR_HORIZON_DAYS = MAX_ADVANCE_BOOKING_DAYS;

/** پنجره‌ی محاسبه‌ی startingPrice برای لیست کابین‌ها. */
export const STARTING_PRICE_WINDOW_DAYS = 30;

/** حداکثر فاصله‌ی endDate یک قاعده‌ی dateRange از امروز. */
export const PRICE_RULE_MAX_FUTURE_DAYS = 365;

/** حداکثر تعداد شب هر رزرو (منبع حقیقت در booking.constants). */
export const MAX_BOOKING_LENGTH_NIGHTS = BOOKING_CONSTANTS.MAX_BOOKING_LENGTH_NIGHTS;

/**
 * اسنپ‌شات همگام ثابت‌ها — برای مسیرهای pure و تست‌ها.
 * کد اپلیکیشن باید از `getPricingLimits()` استفاده کند.
 */
export const PRICING_LIMITS: PricingLimits = Object.freeze({
  maxDiscountsPerNight: MAX_DISCOUNTS_PER_NIGHT,
  maxSurchargesPerNight: MAX_SURCHARGES_PER_NIGHT,
  maxTotalDiscountPercent: MAX_TOTAL_DISCOUNT_PERCENT,
  maxTotalSurchargePercent: MAX_TOTAL_SURCHARGE_PERCENT,
  maxNightlyPrice: MAX_NIGHTLY_PRICE,
  minRegularPrice: MIN_REGULAR_PRICE,
  maxRegularPrice: MAX_REGULAR_PRICE,
  maxAdvanceBookingDays: MAX_ADVANCE_BOOKING_DAYS,
  priceCalendarHorizonDays: PRICE_CALENDAR_HORIZON_DAYS,
  startingPriceWindowDays: STARTING_PRICE_WINDOW_DAYS,
  priceRuleMaxFutureDays: PRICE_RULE_MAX_FUTURE_DAYS,
});

/**
 * خواندن سقف‌ها. async است تا مهاجرت بعدی به جدول `Setting` بدون تغییر
 * امضای فراخوان‌ها ممکن باشد.
 */
export async function getPricingLimits(): Promise<PricingLimits> {
  return { ...PRICING_LIMITS };
}

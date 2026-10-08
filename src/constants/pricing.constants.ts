import { BOOKING_CONSTANTS } from "./booking.constants.js";
import type { PricingLimits } from "../types/pricing.types.js";

//* سقف‌های قابل‌تنظیم در جدول `Setting` نگهداری می‌شوند و در runtime از
//* `services/setting.store` خوانده می‌شوند. مقادیر این فایل صرفاً پیش‌فرض‌های
//* دامنه‌اند (منبع DEFAULT_SETTINGS) و در تست‌ها به‌عنوان مرجع استفاده می‌شوند.

export const MAX_DISCOUNTS_PER_NIGHT = 2;
export const MAX_SURCHARGES_PER_NIGHT = 2;
export const MAX_TOTAL_DISCOUNT_PERCENT = 50;
export const MAX_TOTAL_SURCHARGE_PERCENT = 100;

//* سقف قیمت یک شب (تومان).
export const MAX_NIGHTLY_PRICE = 70_000_000;

export const MIN_REGULAR_PRICE = 1_000_000;

/*
 * سقف `regularPrice` طوری مشتق می‌شود که حتی با حداکثر افزایش قیمت هم از
 * `MAX_NIGHTLY_PRICE` عبور نکند: floor(70_000_000 / 2) = 35_000_000.
 */
export const MAX_REGULAR_PRICE = Math.floor(
  MAX_NIGHTLY_PRICE / (1 + MAX_TOTAL_SURCHARGE_PERCENT / 100),
);

//* از ۳۶۵ به ۱۲۰ روز کاهش می‌یابد
export const MAX_ADVANCE_BOOKING_DAYS = BOOKING_CONSTANTS.MAX_ADVANCE_BOOKING_DAYS;

//*  تقویم قیمت =  رزرو.
export const PRICE_CALENDAR_HORIZON_DAYS = MAX_ADVANCE_BOOKING_DAYS;

//* پنجره‌ی محاسبه‌ی startingPrice برای لیست کابین‌ها. (Filter)
export const STARTING_PRICE_WINDOW_DAYS = 30;

//* حداکثر فاصله‌ی endDate قانون dateRange از امروز.
export const PRICE_RULE_MAX_FUTURE_DAYS = 365;

//* حداکثر تعداد شب هر رزرو
export const MAX_BOOKING_LENGTH_NIGHTS = BOOKING_CONSTANTS.MAX_BOOKING_LENGTH_NIGHTS;

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

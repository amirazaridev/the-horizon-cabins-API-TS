import { BOOKING_CONSTANTS } from "./booking.constants.js";
import {
  MAX_DISCOUNTS_PER_NIGHT,
  MAX_NIGHTLY_PRICE,
  MAX_REGULAR_PRICE,
  MAX_SURCHARGES_PER_NIGHT,
  MAX_TOTAL_DISCOUNT_PERCENT,
  MAX_TOTAL_SURCHARGE_PERCENT,
  MIN_REGULAR_PRICE,
  PRICE_RULE_MAX_FUTURE_DAYS,
  STARTING_PRICE_WINDOW_DAYS,
} from "./pricing.constants.js";
import type { SettingsColumns } from "../types/setting.types.js";

/** بیشترین مقدار قابل‌ذخیره در یک ستون Prisma از نوع `Int` (int4 در Postgres). */
export const INT4_MAX = 2_147_483_647;

/*
 * مقادیر پیش‌فرض جدول `Setting`.
 *
 * **تنها منبع** پیش‌فرض‌ها: هم برای ساخت ردیف اولیه‌ی singleton استفاده می‌شود و
 * هم مقدار اولیهٔ کش در حافظه تا پیش از خواندن از دیتابیس. مقادیر از همان
 * constantهای دامنه مشتق می‌شوند تا هیچ عدد تکراری‌ای وجود نداشته باشد.
 */
export const DEFAULT_SETTINGS: SettingsColumns = {
  minBookingLength: BOOKING_CONSTANTS.MIN_BOOKING_LENGTH_NIGHTS,
  maxBookingLength: BOOKING_CONSTANTS.MAX_BOOKING_LENGTH_NIGHTS,
  maxGuests: BOOKING_CONSTANTS.MAX_GUESTS_PER_BOOKING,
  maxAdvanceBookingDays: BOOKING_CONSTANTS.MAX_ADVANCE_BOOKING_DAYS,
  maxPendingBookingsPerGuest: BOOKING_CONSTANTS.MAX_PENDING_BOOKINGS_PER_GUEST,
  paymentDeadlineMinutes: BOOKING_CONSTANTS.PAYMENT_DEADLINE_MINUTES,

  maxDiscountsPerNight: MAX_DISCOUNTS_PER_NIGHT,
  maxSurchargesPerNight: MAX_SURCHARGES_PER_NIGHT,
  maxTotalDiscountPercent: MAX_TOTAL_DISCOUNT_PERCENT,
  maxTotalSurchargePercent: MAX_TOTAL_SURCHARGE_PERCENT,
  maxNightlyPrice: MAX_NIGHTLY_PRICE,
  minRegularPrice: MIN_REGULAR_PRICE,
  maxRegularPrice: MAX_REGULAR_PRICE,
  startingPriceWindowDays: STARTING_PRICE_WINDOW_DAYS,
  priceRuleMaxFutureDays: PRICE_RULE_MAX_FUTURE_DAYS,
};

/**
 * کلیدهای ستون‌های تنظیمات — از روی `DEFAULT_SETTINGS` ساخته می‌شود.
 *
 * چون `DEFAULT_SETTINGS` از نوع `SettingsColumns` است، افزودن ستون جدید بدون
 * به‌روزرسانی آن باعث خطای TS می‌شود؛ پس این لیست همیشه exhaustive است (برخلاف
 * `satisfies readonly (keyof ...)[]` که فقط زیرمجموعه‌بودن را تضمین می‌کرد).
 */
export const SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS) as (keyof SettingsColumns)[];

/**
 * فیلدهایی که تغییرشان مقادیر **ذخیره‌شده** در تقویم قیمت را متأثر می‌کند و
 * بنابراین نیازمند rebuild خودکار تقویم است:
 * - `maxAdvanceBookingDays`: اندازه‌ی پنجره‌ی تقویم را عوض می‌کند.
 * - چهار سقف دیگر ورودیِ clamp دفاعی موتور قیمت‌گذاری‌اند (`applyDefensiveLimits`).
 *
 * `maxNightlyPrice`، `minRegularPrice` و `maxRegularPrice` عمداً در این لیست
 * نیستند: نه موتور قیمت‌گذاری و نه سازنده‌ی تقویم از آن‌ها استفاده نمی‌کنند
 * (فقط در اعتبارسنجی ورودی نقش دارند)، پس تغییرشان مقدار ذخیره‌شده را عوض نمی‌کند.
 */
export const PRICING_AFFECTING_SETTINGS = [
  "maxAdvanceBookingDays",
  "maxDiscountsPerNight",
  "maxSurchargesPerNight",
  "maxTotalDiscountPercent",
  "maxTotalSurchargePercent",
] as const satisfies readonly (keyof SettingsColumns)[];

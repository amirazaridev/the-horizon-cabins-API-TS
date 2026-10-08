import { deriveMaxRegularPrice } from "../utils/price-limits.util.js";
import type { SettingsColumns } from "../types/setting.types.js";

/** بیشترین مقدار قابل‌ذخیره در یک ستون Prisma از نوع `Int` (int4 در Postgres). */
export const INT4_MAX = 2_147_483_647;

/*
 * مقادیر پیش‌فرض جدول `Setting` — **تنها منبع** پیش‌فرض‌ها.
 *
 * این مقادیر دیگر «سقف معتبر» نیستند؛ صرفاً مقدار اولیه‌ی ردیف تنظیمات‌اند و
 * از این پس مقدار مؤثر در runtime از خود جدول `Setting` خوانده می‌شود.
 */
const DEFAULT_MAX_NIGHTLY_PRICE = 70_000_000;
const DEFAULT_MAX_TOTAL_SURCHARGE_PERCENT = 100;

export const DEFAULT_SETTINGS: Readonly<SettingsColumns> = Object.freeze({
  // Booking
  minBookingLength: 1,
  maxBookingLength: 30,
  maxGuests: 10,
  maxAdvanceBookingDays: 120,
  maxPendingBookingsPerGuest: 3,
  paymentDeadlineMinutes: 30,

  // Pricing
  maxDiscountsPerNight: 2,
  maxSurchargesPerNight: 2,
  maxTotalDiscountPercent: 50,
  maxTotalSurchargePercent: DEFAULT_MAX_TOTAL_SURCHARGE_PERCENT,
  maxNightlyPrice: DEFAULT_MAX_NIGHTLY_PRICE,
  minRegularPrice: 1_000_000,
  //* مشتق‌شده تا invariant «حداکثر افزایش قیمت از سقف قیمت شب عبور نکند» حفظ شود.
  maxRegularPrice: deriveMaxRegularPrice(
    DEFAULT_MAX_NIGHTLY_PRICE,
    DEFAULT_MAX_TOTAL_SURCHARGE_PERCENT,
  ),
  startingPriceWindowDays: 30,
  priceRuleMaxFutureDays: 365,
});

/**
 * کلیدهای ستون‌های تنظیمات — از روی `DEFAULT_SETTINGS` ساخته می‌شود.
 *
 * چون `DEFAULT_SETTINGS` از نوع `SettingsColumns` است، افزودن ستون جدید بدون
 * به‌روزرسانی آن باعث خطای TS می‌شود؛ پس این لیست همیشه exhaustive است.
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

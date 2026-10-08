/**
 * تایپ‌های دامنه‌ی تنظیمات (جدول `Setting`).
 *
 * `SettingsColumns` عیناً ستون‌های قابل‌تنظیم جدول را توصیف می‌کند؛
 * `AppSettings` همان مقادیر به‌علاوهٔ دو مقدار مشتق‌شده است که در کد از
 * ستون‌های پایه محاسبه می‌شوند (نه در دیتابیس).
 */

/** ستون‌های قابل‌تنظیم جدول `settings`. */
export interface SettingsColumns {
  // Booking
  minBookingLength: number;
  maxBookingLength: number;
  maxGuests: number;
  maxAdvanceBookingDays: number;
  maxPendingBookingsPerGuest: number;
  paymentDeadlineMinutes: number;

  // Pricing
  maxDiscountsPerNight: number;
  maxSurchargesPerNight: number;
  maxTotalDiscountPercent: number;
  maxTotalSurchargePercent: number;
  maxNightlyPrice: number;
  minRegularPrice: number;
  maxRegularPrice: number;
  startingPriceWindowDays: number;
  priceRuleMaxFutureDays: number;
}

/** تنظیمات مؤثر در runtime: ستون‌ها + مقادیر مشتق‌شده. */
export interface AppSettings extends SettingsColumns {
  /** افق تقویم قیمت = افق رزرو (طبق طراحی «تقویم = رزرو»). */
  priceCalendarHorizonDays: number;
  /** حداکثر بازهٔ قابل‌پرس‌وجوی تاریخ‌های رزروشده = افق رزرو + ۱. */
  bookedDatesMaxRangeDays: number;
}

/** ورودی PATCH — هر زیرمجموعه‌ای از ستون‌ها. */
export type UpdateSettingsInput = Partial<SettingsColumns>;

/**
 * تایپ‌های مشترک سیستم قیمت‌گذاری پویا.
 *
 * این فایل عمداً هیچ وابستگی‌ای به Prisma Client ندارد تا ماژول موتور قیمت‌گذاری
 * (`src/utils/pricing.engine.ts`) کاملاً pure و قابل‌تست بماند. نام‌های `RuleType`
 * و `RuleKind` با enumهای تولیدی Prisma (`PriceRuleType`/`PriceRuleKind`) هم‌شکل‌اند.
 */

/** نوع قاعده: تخفیف یا افزایش قیمت. */
export type RuleType = "discount" | "surcharge";

/** شکل قاعده: بازه‌ی تاریخی یا روز هفته. */
export type RuleKind = "dateRange" | "weekday";

/**
 * حداقلِ شکلی از یک قاعده که موتور قیمت‌گذاری به آن نیاز دارد.
 * هم ردیف واقعی `PriceRule` و هم fixtureهای تست این قرارداد را برآورده می‌کنند.
 */
export interface PricingRule {
  id: number;
  type: RuleType;
  kind: RuleKind;
  percent: number;
  startDate: Date | null;
  endDate: Date | null;
  weekdays: number[];
  isActive: boolean;
  label: string | null;
}

/** اسنپ‌شات قاعده‌ای که واقعاً روی یک شب اعمال شده (برای ذخیره در BookingNight.appliedRules). */
export interface AppliedRule {
  id: number;
  type: RuleType;
  kind: RuleKind;
  percent: number;
  label: string | null;
}

/** تفکیک قیمت یک شب. */
export interface NightPriceBreakdown {
  basePrice: number;
  discountPercent: number;
  surchargePercent: number;
  finalPrice: number;
  appliedRules: AppliedRule[];
  /** فقط در حالت دفاعی true می‌شود: داده‌ی ذخیره‌شده از سقف‌ها عبور کرده بود. */
  limitsExceeded: boolean;
}

/** تفکیک قیمت یک شب مشخص از اقامت. */
export interface StayNightPrice extends NightPriceBreakdown {
  date: Date;
}

/** نتیجه‌ی محاسبه‌ی قیمت کل اقامت. */
export interface StayPriceResult {
  nights: StayNightPrice[];
  totalPrice: number;
}

/** سقف‌های قابل‌تنظیم قیمت‌گذاری (بعداً از جدول Setting خوانده می‌شوند). */
export interface PricingLimits {
  maxDiscountsPerNight: number;
  maxSurchargesPerNight: number;
  maxTotalDiscountPercent: number;
  maxTotalSurchargePercent: number;
  maxNightlyPrice: number;
  minRegularPrice: number;
  maxRegularPrice: number;
  maxAdvanceBookingDays: number;
  priceCalendarHorizonDays: number;
  startingPriceWindowDays: number;
  priceRuleMaxFutureDays: number;
}

/** دلیل نقض محدودیت. */
export type RuleLimitViolationReason = "MAX_COUNT" | "MAX_PERCENT";

/** یک بازه‌ی متناقضِ ادغام‌شده که محدودیت‌ها را نقض می‌کند. */
export interface RuleLimitViolation {
  type: RuleType;
  reason: RuleLimitViolationReason;
  /** شروع بازه (شامل). */
  from: Date;
  /** پایان بازه (شامل). */
  to: Date;
  /** مقدار مشاهده‌شده (تعداد قاعده یا مجموع درصد) در بدترین روز بازه. */
  found: number;
  /** سقف مجاز. */
  limit: number;
}

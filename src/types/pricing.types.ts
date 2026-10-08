/**
 * تایپ‌های مشترک سیستم قیمت‌گذاری پویا.
 *
 * `RuleType` و `RuleKind` عیناً از enumهای تولیدی Prisma گرفته می‌شوند تا هیچ
 * union دستیِ موازی‌ای نداشته باشیم و کست‌های `as PricingRule[]` حذف شوند.
 * با این حال این فایل فقط **type** ایمپورت می‌کند (type-only)، پس در runtime
 * هیچ وابستگی‌ای به Prisma Client ایجاد نمی‌شود و موتور قیمت‌گذاری pure می‌ماند.
 */

import type {
  PriceRule as PrismaPriceRule,
  PriceRuleKind as PrismaPriceRuleKind,
  PriceRuleType as PrismaPriceRuleType,
} from "../generated/prisma/client.js";

/** نوع قاعده: تخفیف یا افزایش قیمت (enum تولیدی Prisma). */
export type RuleType = PrismaPriceRuleType;

/** شکل قاعده: بازه‌ی تاریخی یا روز هفته (enum تولیدی Prisma). */
export type RuleKind = PrismaPriceRuleKind;

/**
 * حداقلِ شکلی از یک قاعده که موتور قیمت‌گذاری به آن نیاز دارد.
 * مستقیم از ردیف `PriceRule` مشتق می‌شود، پس هم ردیف واقعی Prisma و هم
 * fixtureهای تست بدون کست این قرارداد را برآورده می‌کنند.
 */
export type PricingRule = Pick<
  PrismaPriceRule,
  | "id"
  | "type"
  | "kind"
  | "percent"
  | "startDate"
  | "endDate"
  | "weekdays"
  | "isActive"
  | "label"
>;

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

/** سقف‌های قابل‌تنظیم قیمت‌گذاری (از جدول `Setting` خوانده می‌شوند). */
export interface PricingLimits {
  maxDiscountsPerNight: number;
  maxSurchargesPerNight: number;
  maxTotalDiscountPercent: number;
  maxTotalSurchargePercent: number;
  maxNightlyPrice: number;
  minRegularPrice: number;
  maxRegularPrice: number;
  /** افق تقویم قیمت — همان افق رزرو (`maxAdvanceBookingDays`). */
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

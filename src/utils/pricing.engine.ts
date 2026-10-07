import { AppError } from "./AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { MAX_INT32 } from "./booking-price.util.js";
import { addDaysUtc, isoWeekday, nightsBetween } from "./date.util.js";
import type {
  AppliedRule,
  NightPriceBreakdown,
  PricingLimits,
  PricingRule,
  RuleLimitViolation,
  RuleType,
} from "../types/pricing.types.js";

/**
 * موتور قیمت‌گذاری — **تنها منبع حقیقت** برای محاسبه‌ی قیمت شب.
 *
 * این ماژول pure است (بدون دیتابیس و بدون logger، بدون side effect) و هیچ‌جا
 * فرمول را دوباره در SQL پیاده نمی‌کنیم؛ تقویم قیمت هم با همین موتور پر می‌شود
 * تا «drift» فرمول رخ ندهد.
 */

/** اسنپ‌شات یک قاعده برای ذخیره در `BookingNight.appliedRules`. */
function toAppliedRule(rule: PricingRule): AppliedRule {
  return {
    id: rule.id,
    type: rule.type,
    kind: rule.kind,
    percent: rule.percent,
    label: rule.label,
  };
}

/** آیا این قاعده شبِ `date` را پوشش می‌دهد؟ */
function ruleCoversNight(rule: PricingRule, date: Date): boolean {
  if (!rule.isActive) return false;

  if (rule.kind === "dateRange") {
    if (!rule.startDate || !rule.endDate) return false;
    const t = date.getTime();
    return rule.startDate.getTime() <= t && t <= rule.endDate.getTime();
  }

  return rule.weekdays.includes(isoWeekday(date));
}

/** قواعد فعالی که شبِ `date` را پوشش می‌دهند (بدون اعمال سقف‌ها). */
export function rulesForNight(rules: PricingRule[], date: Date): PricingRule[] {
  return rules.filter((rule) => ruleCoversNight(rule, date));
}

/**
 * محاسبه‌ی قیمت یک شب از روی قواعدِ **از قبل انتخاب‌شده**.
 * فرمول: floor(base * (100 + S) * (100 - D) / 10000) — یک floor واحد در پایان.
 */
export function calculateNightPrice(
  basePrice: number,
  appliedRules: PricingRule[],
  limitsExceeded = false,
): NightPriceBreakdown {
  let discountPercent = 0;
  let surchargePercent = 0;

  for (const rule of appliedRules) {
    if (rule.type === "discount") discountPercent += rule.percent;
    else surchargePercent += rule.percent;
  }

  const finalPrice = Math.floor(
    (basePrice * (100 + surchargePercent) * (100 - discountPercent)) / 10_000,
  );

  return {
    basePrice,
    discountPercent,
    surchargePercent,
    finalPrice,
    appliedRules: appliedRules.map(toAppliedRule),
    limitsExceeded,
  };
}

interface ClampResult {
  rules: PricingRule[];
  exceeded: boolean;
}

/**
 * نگه‌داشتن حداکثر `maxCount` قاعده با بیشترین درصد، سپس سقف‌زدن مجموع درصد.
 * این تابع فقط در حالت دفاعی استفاده می‌شود (وقتی داده‌ی ذخیره‌شده از سقف عبور کرده).
 */
function clampGroup(rules: PricingRule[], maxCount: number, maxPercent: number): ClampResult {
  const sorted = [...rules].sort((a, b) => b.percent - a.percent || a.id - b.id);
  const exceededByCount = sorted.length > maxCount;
  const top = sorted.slice(0, maxCount);
  const sum = top.reduce((acc, rule) => acc + rule.percent, 0);

  if (!exceededByCount && sum <= maxPercent) {
    return { rules: top, exceeded: false };
  }

  const kept: PricingRule[] = [];
  let remaining = maxPercent;
  for (const rule of top) {
    if (remaining <= 0) break;
    if (rule.percent <= remaining) {
      kept.push(rule);
      remaining -= rule.percent;
    } else {
      kept.push({ ...rule, percent: remaining });
      remaining = 0;
    }
  }

  return { rules: kept, exceeded: true };
}

/**
 * حالت دفاعی خواندن: اگر داده‌ی ذخیره‌شده سقف‌ها را نقض کرده باشد، موتور
 * نباید throw کند (مسیر رزرو حساس است). قواعد با بیشترین درصد تا سقفِ تعداد
 * نگه داشته می‌شوند، مجموع درصدها سقف‌زده می‌شود و شب با `limitsExceeded: true`
 * علامت می‌خورد.
 *
 * ⚠️ این تابع pure است و چیزی لاگ نمی‌کند؛ مسئولیت لاگ با فراخوان است
 * (یک بار به‌ازای هر quote / هر rebuild کابین، نه هر شب).
 */
export function applyDefensiveLimits(
  rules: PricingRule[],
  limits: PricingLimits,
): ClampResult {
  const discounts = clampGroup(
    rules.filter((rule) => rule.type === "discount"),
    limits.maxDiscountsPerNight,
    limits.maxTotalDiscountPercent,
  );
  const surcharges = clampGroup(
    rules.filter((rule) => rule.type === "surcharge"),
    limits.maxSurchargesPerNight,
    limits.maxTotalSurchargePercent,
  );

  return {
    rules: [...discounts.rules, ...surcharges.rules],
    exceeded: discounts.exceeded || surcharges.exceeded,
  };
}

/**
 * **خط لوله‌ی واحد هر شب**: انتخاب قواعد پوشاننده → اعمال سقفِ دفاعی → محاسبه‌ی
 * قیمت. تقویم، quote و snapshot رزرو همگی از همین یک تابع رد می‌شوند تا هیچ‌وقت
 * دو پیاده‌سازی موازی نداشته باشیم.
 */
export function priceNight(
  basePrice: number,
  rules: PricingRule[],
  date: Date,
  limits: PricingLimits,
): NightPriceBreakdown {
  const covering = rulesForNight(rules, date);
  const clamped = applyDefensiveLimits(covering, limits);
  return calculateNightPrice(basePrice, clamped.rules, clamped.exceeded);
}

/** جمع امن (بدون سرریز Int32) قیمت شب‌ها؛ در سرریز `null` برمی‌گرداند. */
function sumNightPricesSafe(nightlyPrices: number[]): number | null {
  let total = 0;
  for (const price of nightlyPrices) {
    total += price;
    if (total > MAX_INT32) return null;
  }
  return total;
}

/** یک شبِ محاسبه‌شده برای پاسخ قیمت (شامل تاریخ). */
export interface QuotedNight {
  date: Date;
  basePrice: number;
  discountPercent: number;
  surchargePercent: number;
  finalPrice: number;
  appliedRules: AppliedRule[];
  limitsExceeded: boolean;
}

export interface QuotedStay {
  nights: QuotedNight[];
  /** جمع کل — در محدوده‌ی Int32؛ در سرریز `AppError(BOOKING_TOTAL_OVERFLOW)` پرتاب می‌شود. */
  totalPrice: number;
  /** اگر هر شبی سقف‌ها را نقض کرده باشد true (یک بار در سطح اقامت). */
  limitsExceeded: boolean;
}

/**
 * قیمت یک بازه‌ی اقامت `[startDate, endDate)` را از روی قواعدِ از قبل انتخاب‌شده
 * محاسبه می‌کند. شب‌ها `startDate .. endDate-1` هستند و هر شب از `priceNight`
 * رد می‌شود.
 *
 * جمع کل با همان منطق سرریزِ امنِ رزرو محاسبه می‌شود؛ در سرریز همان
 * `BOOKING_TOTAL_OVERFLOW` پرتاب می‌شود تا رزرو و quote دقیقاً یک رفتار داشته باشند.
 */
export function quoteStayPrice(
  basePrice: number,
  rules: PricingRule[],
  startDate: Date,
  endDate: Date,
  limits: PricingLimits,
): QuotedStay {
  const numNights = nightsBetween(startDate, endDate);
  const nights: QuotedNight[] = [];
  let limitsExceeded = false;

  for (let i = 0; i < numNights; i += 1) {
    const date = addDaysUtc(startDate, i);
    const breakdown = priceNight(basePrice, rules, date, limits);

    if (breakdown.limitsExceeded) limitsExceeded = true;

    nights.push({
      date,
      basePrice: breakdown.basePrice,
      discountPercent: breakdown.discountPercent,
      surchargePercent: breakdown.surchargePercent,
      finalPrice: breakdown.finalPrice,
      appliedRules: breakdown.appliedRules,
      limitsExceeded: breakdown.limitsExceeded,
    });
  }

  const totalPrice = sumNightPricesSafe(nights.map((night) => night.finalPrice));
  if (totalPrice === null) {
    throw new AppError(
      "The computed booking total exceeds the supported range",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_TOTAL_OVERFLOW,
    );
  }

  return { nights, totalPrice, limitsExceeded };
}

interface DayStat {
  index: number;
  count: number;
  sum: number;
}

/** ادغام روزهای متوالیِ ناقض به بازه‌های پیوسته. */
function mergeViolationDays(
  days: DayStat[],
  today: Date,
  pick: (stat: DayStat) => number,
): { from: Date; to: Date; found: number }[] {
  const ranges: { from: Date; to: Date; found: number }[] = [];

  for (const day of days) {
    const value = pick(day);
    const last = ranges[ranges.length - 1];
    const isConsecutive =
      last !== undefined &&
      last.to.getTime() === addDaysUtc(today, day.index - 1).getTime();

    if (isConsecutive) {
      last.to = addDaysUtc(today, day.index);
      last.found = Math.max(last.found, value);
    } else {
      ranges.push({ from: addDaysUtc(today, day.index), to: addDaysUtc(today, day.index), found: value });
    }
  }

  return ranges;
}

/**
 * اعتبارسنجی زمانِ نوشتن: همه‌ی قواعد فعالِ کابین (بعد از اعمال تغییرِ درخواستی
 * در حافظه) را روز‌به‌روز روی `[today, today + PRICE_RULE_MAX_FUTURE_DAYS]`
 * شبیه‌سازی می‌کند (افق در صورت وجود قاعده‌ای با endDate دورتر، گسترش می‌یابد).
 *
 * چون هر روز جداگانه بررسی می‌شود، هم‌پوشانی weekday-weekday و
 * weekday-dateRange به‌طور خودکار گرفته می‌شود.
 *
 * @returns فهرست بازه‌های متناقض (ادغام‌شده)؛ آرایه‌ی خالی یعنی معتبر است.
 */
export function validateRuleSet(
  candidateActiveRules: PricingRule[],
  today: Date,
  limits: PricingLimits,
): RuleLimitViolation[] {
  let end = addDaysUtc(today, limits.priceRuleMaxFutureDays);

  for (const rule of candidateActiveRules) {
    if (rule.endDate && rule.endDate.getTime() > end.getTime()) end = rule.endDate;
  }

  const totalDays = nightsBetween(today, end) + 1;
  const active = candidateActiveRules.filter((rule) => rule.isActive);
  const violations: RuleLimitViolation[] = [];

  const groups: { type: RuleType; maxCount: number; maxPercent: number }[] = [
    {
      type: "discount",
      maxCount: limits.maxDiscountsPerNight,
      maxPercent: limits.maxTotalDiscountPercent,
    },
    {
      type: "surcharge",
      maxCount: limits.maxSurchargesPerNight,
      maxPercent: limits.maxTotalSurchargePercent,
    },
  ];

  for (const group of groups) {
    const typeRules = active.filter((rule) => rule.type === group.type);
    const countDays: DayStat[] = [];
    const percentDays: DayStat[] = [];

    for (let i = 0; i < totalDays; i += 1) {
      const date = addDaysUtc(today, i);
      const covering = rulesForNight(typeRules, date);
      const sum = covering.reduce((acc, rule) => acc + rule.percent, 0);
      const stat: DayStat = { index: i, count: covering.length, sum };

      if (stat.count > group.maxCount) countDays.push(stat);
      if (stat.sum > group.maxPercent) percentDays.push(stat);
    }

    for (const range of mergeViolationDays(countDays, today, (s) => s.count)) {
      violations.push({
        type: group.type,
        reason: "MAX_COUNT",
        from: range.from,
        to: range.to,
        found: range.found,
        limit: group.maxCount,
      });
    }

    for (const range of mergeViolationDays(percentDays, today, (s) => s.sum)) {
      violations.push({
        type: group.type,
        reason: "MAX_PERCENT",
        from: range.from,
        to: range.to,
        found: range.found,
        limit: group.maxPercent,
      });
    }
  }

  return violations;
}

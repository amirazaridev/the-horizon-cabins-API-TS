import type { PriceRule } from "../generated/prisma/client.js";
import type { PricingRule } from "../types/pricing.types.js";

/**
 * نگاشت ردیف Prisma به شکل موردنیاز موتور قیمت‌گذاری.
 *
 * چون `PricingRule` خودش `Pick<PriceRule, ...>` است و همه‌ی فیلدهای موردنیاز
 * با نوع سازگار برمی‌گردند، این تابع دیگر به کست نیاز ندارد.
 */
export function toPricingRule(rule: PriceRule): PricingRule {
  return {
    id: rule.id,
    type: rule.type,
    kind: rule.kind,
    percent: rule.percent,
    startDate: rule.startDate,
    endDate: rule.endDate,
    weekdays: rule.weekdays,
    isActive: rule.isActive,
    label: rule.label,
  };
}

/** اسنپ‌شات یک قاعده برای آرشیو (فرمت `YYYY-MM-DD`). */
export function auditSnapshot(rule: PriceRule) {
  return {
    id: rule.id,
    cabinId: rule.cabinId,
    type: rule.type,
    kind: rule.kind,
    percent: rule.percent,
    startDate: rule.startDate ? ymd(rule.startDate) : null,
    endDate: rule.endDate ? ymd(rule.endDate) : null,
    weekdays: rule.weekdays,
    label: rule.label,
    isActive: rule.isActive,
  };
}

/** تاریخ را به `YYYY-MM-DD` تبدیل می‌کند (بدون timezone drift). */
export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

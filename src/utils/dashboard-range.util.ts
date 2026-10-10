import { addDaysUtc, nightsBetween } from "./date.util.js";
import type { CompareMode, DateRange } from "../types/dashboard.types.js";

/** تعداد روزهای بازه (شامل هر دو سر). */
export function inclusiveDayCount(from: Date, to: Date): number {
  return nightsBetween(from, to) + 1;
}

/**
 * ساخت بازه‌ی مقایسه — **هم‌منطق** با `resolveCompareRange` فرانت.
 *
 * - `prev-period`: بازه‌ی قبل به همان طول، بی‌درنگ پیش از `from`
 * - `prev-year`: همان بازه یک سال قبل (۳۶۵ روز عقب، برای YoY)
 * - `none`: `null`
 *
 * ⚠️ «سال قبل» عمداً با **۳۶۵ روز** محاسبه می‌شود نه با تغییر سال تقویمی،
 * چون ماه‌های شمسی ۲۹/۳۰/۳۱ روزه‌اند و مقایسه‌ی طول‌برابر معنادارتر است.
 */
export function resolveCompareRange(
  range: DateRange,
  mode: CompareMode,
): DateRange | null {
  if (mode === "none") return null;

  if (mode === "prev-year") {
    return {
      from: addDaysUtc(range.from, -365),
      to: addDaysUtc(range.to, -365),
    };
  }

  const length = inclusiveDayCount(range.from, range.to);
  const prevTo = addDaysUtc(range.from, -1);
  const prevFrom = addDaysUtc(prevTo, -(length - 1));

  return { from: prevFrom, to: prevTo };
}

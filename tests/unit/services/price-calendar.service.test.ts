import { describe, it, expect } from "vitest";
import {
  getCalendarWindow,
  resolveAffectedCalendarRange,
} from "../../../src/services/price-calendar.service.js";
import { PRICING_LIMITS } from "../../../src/constants/pricing.constants.js";
import { addDaysUtc } from "../../../src/utils/date.util.js";
import type { PricingRule } from "../../../src/types/pricing.types.js";

function d(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rule(partial: Partial<PricingRule> & { id: number }): PricingRule {
  return {
    type: "discount",
    kind: "dateRange",
    percent: 10,
    startDate: null,
    endDate: null,
    weekdays: [],
    isActive: true,
    label: null,
    ...partial,
  };
}

//* پنجره‌ی ثابت برای تست‌ها (بدون وابستگی به ساعت اجرا).
const WINDOW = { from: d("2026-06-01"), to: d("2026-06-30") };

describe("resolveAffectedCalendarRange", () => {
  it("returns null when there is nothing before or after (no-op)", () => {
    expect(resolveAffectedCalendarRange(null, null, WINDOW)).toBeNull();
  });

  it("returns the whole window for a weekday rule (any weekday can be affected)", () => {
    const weekday = rule({ id: 1, kind: "weekday", weekdays: [3] });
    const result = resolveAffectedCalendarRange(null, weekday, WINDOW);

    expect(result).toEqual(WINDOW);
  });

  it("clips a dateRange rule to the intersection with the window", () => {
    // قاعده از میانه‌ی ماه شروع و کمی بعد از پنجره تمام می‌شود.
    const range = rule({ id: 1, startDate: d("2026-06-10"), endDate: d("2026-07-15") });
    const result = resolveAffectedCalendarRange(null, range, WINDOW);

    expect(ymd(result!.from)).toBe("2026-06-10");
    expect(ymd(result!.to)).toBe("2026-06-30");
  });

  it("merges the affected spans of the before and after rules", () => {
    const before = rule({ id: 1, startDate: d("2026-06-02"), endDate: d("2026-06-05") });
    const after = rule({ id: 1, startDate: d("2026-06-20"), endDate: d("2026-06-25") });
    const result = resolveAffectedCalendarRange(before, after, WINDOW);

    // اتحاد دو بازه: از کوچک‌ترین شروع تا بزرگ‌ترین پایان.
    expect(ymd(result!.from)).toBe("2026-06-02");
    expect(ymd(result!.to)).toBe("2026-06-25");
  });

  it("returns null when a dateRange rule lies entirely outside the window", () => {
    const past = rule({ id: 1, startDate: d("2026-01-01"), endDate: d("2026-01-31") });
    expect(resolveAffectedCalendarRange(past, null, WINDOW)).toBeNull();

    const future = rule({ id: 1, startDate: d("2026-12-01"), endDate: d("2026-12-31") });
    expect(resolveAffectedCalendarRange(null, future, WINDOW)).toBeNull();
  });

  it("covers a rule that fully contains the window", () => {
    const range = rule({ id: 1, startDate: d("2026-01-01"), endDate: d("2026-12-31") });
    expect(resolveAffectedCalendarRange(null, range, WINDOW)).toEqual(WINDOW);
  });
});

describe("getCalendarWindow", () => {
  it("spans exactly priceCalendarHorizonDays from today (Tehran)", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const window = getCalendarWindow(now);

    expect(ymd(window.from)).toBe("2026-06-15");
    expect(ymd(window.to)).toBe(
      ymd(addDaysUtc(window.from, PRICING_LIMITS.priceCalendarHorizonDays - 1)),
    );
  });
});

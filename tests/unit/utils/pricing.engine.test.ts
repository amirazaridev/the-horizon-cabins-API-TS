import { describe, it, expect } from "vitest";
import {
  applyDefensiveLimits,
  calculateNightPrice,
  priceNight,
  quoteStayPrice,
  rulesForNight,
} from "../../../src/utils/pricing.engine.js";
import { DEFAULT_PRICING_LIMITS } from "../../helpers/settings.js";
import type { PricingRule } from "../../../src/types/pricing.types.js";

/** ساخت قاعده‌ی تست با پیش‌فرض‌های معتبر. */
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

/** تاریخ نیمه‌شب UTC. 2026-01-05 دوشنبه است (ISO=1). */
function d(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

describe("pricing.engine", () => {
  // ==================================================================
  // rulesForNight
  // ==================================================================
  describe("rulesForNight", () => {
    it("matches a dateRange rule inclusively on both ends", () => {
      const r = rule({ id: 1, startDate: d("2026-01-05"), endDate: d("2026-01-10") });

      expect(rulesForNight([r], d("2026-01-04"))).toHaveLength(0);
      expect(rulesForNight([r], d("2026-01-05"))).toHaveLength(1); // start inclusive
      expect(rulesForNight([r], d("2026-01-07"))).toHaveLength(1);
      expect(rulesForNight([r], d("2026-01-10"))).toHaveLength(1); // end inclusive
      expect(rulesForNight([r], d("2026-01-11"))).toHaveLength(0);
    });

    it("maps ISO weekdays correctly (Wed=3, Thu=4, Fri=5)", () => {
      const r = rule({ id: 1, kind: "weekday", weekdays: [3, 4, 5] });

      expect(rulesForNight([r], d("2026-01-06"))).toHaveLength(0); // Tuesday (2)
      expect(rulesForNight([r], d("2026-01-07"))).toHaveLength(1); // Wednesday
      expect(rulesForNight([r], d("2026-01-08"))).toHaveLength(1); // Thursday
      expect(rulesForNight([r], d("2026-01-09"))).toHaveLength(1); // Friday
      expect(rulesForNight([r], d("2026-01-10"))).toHaveLength(0); // Saturday (6)
      expect(rulesForNight([r], d("2026-01-11"))).toHaveLength(0); // Sunday (7)
    });

    it("treats Sunday as ISO 7", () => {
      const sunday = rule({ id: 1, kind: "weekday", weekdays: [7] });
      expect(rulesForNight([sunday], d("2026-01-11"))).toHaveLength(1); // Sunday
      expect(rulesForNight([sunday], d("2026-01-05"))).toHaveLength(0); // Monday
    });

    it("ignores inactive rules", () => {
      const r = rule({ id: 1, startDate: d("2026-01-05"), endDate: d("2026-01-10"), isActive: false });
      expect(rulesForNight([r], d("2026-01-06"))).toHaveLength(0);
    });

    it("returns a weekday rule and a dateRange rule together when both cover the night", () => {
      const weekday = rule({ id: 1, kind: "weekday", weekdays: [3] }); // Wednesday
      const range = rule({ id: 2, startDate: d("2026-01-01"), endDate: d("2026-01-31") });

      const covering = rulesForNight([weekday, range], d("2026-01-07"));
      expect(covering.map((r) => r.id).sort()).toEqual([1, 2]);
    });
  });

  // ==================================================================
  // calculateNightPrice — nightly formula
  // ==================================================================
  describe("calculateNightPrice", () => {
    it("applies a single discount", () => {
      const result = calculateNightPrice(10_000_000, [rule({ id: 1, percent: 20 })]);
      expect(result).toMatchObject({ discountPercent: 20, surchargePercent: 0, finalPrice: 8_000_000 });
    });

    it("applies a single surcharge", () => {
      const result = calculateNightPrice(10_000_000, [
        rule({ id: 1, type: "surcharge", percent: 15 }),
      ]);
      expect(result).toMatchObject({ discountPercent: 0, surchargePercent: 15, finalPrice: 11_500_000 });
    });

    it("adds multiple discounts", () => {
      const result = calculateNightPrice(10_000_000, [
        rule({ id: 1, percent: 10 }),
        rule({ id: 2, percent: 20 }),
      ]);
      expect(result.discountPercent).toBe(30);
      expect(result.finalPrice).toBe(7_000_000);
    });

    it("combines discount and surcharge multiplicatively (base 10,000,000; S=30; D=20 → 10,400,000)", () => {
      const result = calculateNightPrice(10_000_000, [
        rule({ id: 1, type: "surcharge", percent: 30 }),
        rule({ id: 2, percent: 20 }),
      ]);
      expect(result.surchargePercent).toBe(30);
      expect(result.discountPercent).toBe(20);
      expect(result.finalPrice).toBe(10_400_000);
    });

    it("floors exactly once at the end", () => {
      // 9_999_999 * 90 / 100 = 8_999_999.1 → 8_999_999
      const result = calculateNightPrice(9_999_999, [rule({ id: 1, percent: 10 })]);
      expect(result.finalPrice).toBe(8_999_999);
    });

    it("returns base price when no rules apply", () => {
      expect(calculateNightPrice(5_000_000, []).finalPrice).toBe(5_000_000);
    });

    it("snapshots applied rules as {id,type,kind,percent,label}", () => {
      const result = calculateNightPrice(1_000_000, [
        rule({ id: 7, type: "surcharge", kind: "weekday", percent: 25, label: "Holiday" }),
      ]);
      expect(result.appliedRules).toEqual([
        { id: 7, type: "surcharge", kind: "weekday", percent: 25, label: "Holiday" },
      ]);
    });
  });

  // ==================================================================
  // priceNight — the single per-night pipeline
  // ==================================================================
  describe("priceNight", () => {
    it("selects covering rules, clamps them and computes the night price", () => {
      const wednesday = rule({ id: 1, kind: "weekday", weekdays: [3], percent: 30 });

      const onWed = priceNight(1_000_000, [wednesday], d("2026-01-07"), DEFAULT_PRICING_LIMITS);
      expect(onWed.discountPercent).toBe(30);
      expect(onWed.finalPrice).toBe(700_000);

      const onTue = priceNight(1_000_000, [wednesday], d("2026-01-06"), DEFAULT_PRICING_LIMITS);
      expect(onTue.discountPercent).toBe(0);
      expect(onTue.finalPrice).toBe(1_000_000);
    });

    it("applies the defensive clamp and flags limitsExceeded without throwing", () => {
      const rules = [
        rule({ id: 1, percent: 40, startDate: d("2026-01-01"), endDate: d("2026-01-31") }),
        rule({ id: 2, percent: 40, startDate: d("2026-01-01"), endDate: d("2026-01-31") }),
        rule({ id: 3, percent: 40, startDate: d("2026-01-01"), endDate: d("2026-01-31") }),
      ];

      const night = priceNight(10_000_000, rules, d("2026-01-07"), DEFAULT_PRICING_LIMITS);
      expect(night.limitsExceeded).toBe(true);
      expect(night.discountPercent).toBe(50); // clamped to MAX_TOTAL_DISCOUNT_PERCENT
      expect(night.finalPrice).toBe(5_000_000);
    });
  });

  // ==================================================================
  // applyDefensiveLimits (safety net)
  // ==================================================================
  describe("applyDefensiveLimits (safety net)", () => {
    it("clamps the discount total to MAX_TOTAL_DISCOUNT_PERCENT and flags the night", () => {
      const rules = [
        rule({ id: 1, percent: 40 }),
        rule({ id: 2, percent: 40 }),
        rule({ id: 3, percent: 40 }),
      ];

      const clamped = applyDefensiveLimits(rules, DEFAULT_PRICING_LIMITS);

      expect(clamped.exceeded).toBe(true);
      // top-2 by percent kept (40 + 40 = 80 > 50) → second clamped to 10
      expect(clamped.rules.map((r) => r.percent)).toEqual([40, 10]);

      const breakdown = calculateNightPrice(10_000_000, clamped.rules, clamped.exceeded);
      expect(breakdown.discountPercent).toBe(50);
      expect(breakdown.limitsExceeded).toBe(true);
      expect(breakdown.finalPrice).toBe(5_000_000);
    });

    it("enforces the count limit even when the percent total is fine", () => {
      const rules = [rule({ id: 1, percent: 10 }), rule({ id: 2, percent: 10 }), rule({ id: 3, percent: 10 })];

      const clamped = applyDefensiveLimits(rules, DEFAULT_PRICING_LIMITS);

      expect(clamped.exceeded).toBe(true);
      expect(clamped.rules).toHaveLength(2);
    });

    it("does not flag when rules are within limits", () => {
      const clamped = applyDefensiveLimits(
        [rule({ id: 1, percent: 50 }), rule({ id: 2, type: "surcharge", percent: 100 })],
        DEFAULT_PRICING_LIMITS,
      );

      expect(clamped.exceeded).toBe(false);
      expect(clamped.rules).toHaveLength(2);
    });
  });

  // ==================================================================
  // quoteStayPrice
  // ==================================================================
  describe("quoteStayPrice", () => {
    it("returns one entry per night and the overflow-safe sum of finals", () => {
      const range = rule({ id: 1, percent: 50, startDate: d("2026-01-05"), endDate: d("2026-01-31") });
      const { nights, totalPrice } = quoteStayPrice(
        1_000_000,
        [range],
        d("2026-01-05"),
        d("2026-01-08"),
        DEFAULT_PRICING_LIMITS,
      );

      expect(nights).toHaveLength(3);
      expect(nights.map((n) => n.date.toISOString().slice(0, 10))).toEqual([
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
      ]);
      expect(totalPrice).toBe(1_500_000);
    });

    it("applies weekday rules only on matching nights of the stay", () => {
      const wednesday = rule({ id: 1, kind: "weekday", weekdays: [3], type: "surcharge", percent: 100 });
      // 2026-01-05 (Mon) .. 2026-01-09 → nights 05,06,07,08 ; only Wed (07) is surcharged.
      const { nights } = quoteStayPrice(1_000_000, [wednesday], d("2026-01-05"), d("2026-01-09"), DEFAULT_PRICING_LIMITS);

      expect(nights.map((n) => n.finalPrice)).toEqual([1_000_000, 1_000_000, 2_000_000, 1_000_000]);
      expect(nights[2].surchargePercent).toBe(100);
      expect(nights[2].finalPrice).toBe(2_000_000);
    });

    it("flags limitsExceeded once at the stay level when any night was clamped", () => {
      const rules = [1, 2, 3].map((id) =>
        rule({ id, percent: 40, startDate: d("2026-01-05"), endDate: d("2026-01-31") }),
      );
      const quote = quoteStayPrice(1_000_000, rules, d("2026-01-05"), d("2026-01-07"), DEFAULT_PRICING_LIMITS);

      expect(quote.limitsExceeded).toBe(true);
      expect(quote.nights.every((n) => n.limitsExceeded)).toBe(true);
    });

    it("throws BOOKING_TOTAL_OVERFLOW when the sum leaves the Int32 range", () => {
      // 30 شب × نزدیک Int32 سقف را رد می‌کند.
      const bigSurcharge = rule({
        id: 1,
        type: "surcharge",
        percent: 100,
        startDate: d("2026-01-01"),
        endDate: d("2026-01-31"),
      });

      expect(() =>
        quoteStayPrice(2_000_000_000, [bigSurcharge], d("2026-01-05"), d("2026-01-10"), DEFAULT_PRICING_LIMITS),
      ).toThrowError(/supported range/);
    });

    it("matches the calendar pipeline night by night (identical numbers)", () => {
      const rules = [
        rule({ id: 1, kind: "weekday", weekdays: [3, 5], type: "surcharge", percent: 25 }),
        rule({ id: 2, percent: 10, startDate: d("2026-01-01"), endDate: d("2026-01-31") }),
      ];

      const quote = quoteStayPrice(1_000_000, rules, d("2026-01-05"), d("2026-01-10"), DEFAULT_PRICING_LIMITS);

      // تقویم همان تابع `priceNight` را برای هر شب صدا می‌زند؛ پس باید مو‌به‌مو یکسان باشد.
      const fromCalendar = quote.nights.map((night) =>
        priceNight(1_000_000, rules, night.date, DEFAULT_PRICING_LIMITS),
      );

      expect(fromCalendar.map((b) => b.finalPrice)).toEqual(quote.nights.map((n) => n.finalPrice));
      expect(fromCalendar.map((b) => b.discountPercent)).toEqual(
        quote.nights.map((n) => n.discountPercent),
      );
      expect(fromCalendar.map((b) => b.surchargePercent)).toEqual(
        quote.nights.map((n) => n.surchargePercent),
      );
      expect(fromCalendar.reduce((sum, b) => sum + b.finalPrice, 0)).toBe(quote.totalPrice);
    });
  });
});

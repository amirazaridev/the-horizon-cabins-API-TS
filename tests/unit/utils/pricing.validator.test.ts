import { describe, it, expect } from "vitest";
import { validateRuleSet } from "../../../src/utils/pricing.engine.js";
import { DEFAULT_PRICING_LIMITS } from "../../helpers/settings.js";
import type { PricingRule } from "../../../src/types/pricing.types.js";

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

function d(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 2026-01-05 دوشنبه است. */
const TODAY = d("2026-01-05");
const LIMITS = DEFAULT_PRICING_LIMITS;

describe("pricing.validator (validateRuleSet)", () => {
  // ==================================================================
  // count limits
  // ==================================================================
  describe("count limits", () => {
    it("accepts two discounts on the same night", () => {
      const rules = [
        rule({ id: 1, startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 2, startDate: TODAY, endDate: d("2026-01-20") }),
      ];
      expect(validateRuleSet(rules, TODAY, LIMITS)).toEqual([]);
    });

    it("rejects a third discount on the same night with a merged MAX_COUNT range", () => {
      const rules = [1, 2, 3].map((id) =>
        rule({ id, startDate: d("2026-01-05"), endDate: d("2026-01-15") }),
      );
      const violations = validateRuleSet(rules, TODAY, LIMITS);

      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({
        type: "discount",
        reason: "MAX_COUNT",
        found: 3,
        limit: 2,
      });
      expect(ymd(violations[0].from)).toBe("2026-01-05");
      expect(ymd(violations[0].to)).toBe("2026-01-15");
    });

    it("accepts two surcharges but rejects a third", () => {
      const two = [1, 2].map((id) =>
        rule({ id, type: "surcharge", startDate: TODAY, endDate: d("2026-01-20") }),
      );
      expect(validateRuleSet(two, TODAY, LIMITS)).toEqual([]);

      const three = [1, 2, 3].map((id) =>
        rule({ id, type: "surcharge", startDate: TODAY, endDate: d("2026-01-20") }),
      );
      const violations = validateRuleSet(three, TODAY, LIMITS);
      expect(violations[0]).toMatchObject({ type: "surcharge", reason: "MAX_COUNT", limit: 2 });
    });

    it("does not mix discount and surcharge counts", () => {
      const rules = [
        rule({ id: 1, type: "discount", startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 2, type: "discount", startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 3, type: "surcharge", startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 4, type: "surcharge", startDate: TODAY, endDate: d("2026-01-20") }),
      ];
      expect(validateRuleSet(rules, TODAY, LIMITS)).toEqual([]);
    });
  });

  // ==================================================================
  // percent limits
  // ==================================================================
  describe("percent limits", () => {
    it("accepts a discount sum of exactly 50", () => {
      const rules = [
        rule({ id: 1, percent: 30, startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 2, percent: 20, startDate: TODAY, endDate: d("2026-01-20") }),
      ];
      expect(validateRuleSet(rules, TODAY, LIMITS)).toEqual([]);
    });

    it("rejects a discount sum of 51", () => {
      const rules = [
        rule({ id: 1, percent: 30, startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 2, percent: 21, startDate: TODAY, endDate: d("2026-01-20") }),
      ];
      const violations = validateRuleSet(rules, TODAY, LIMITS);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ reason: "MAX_PERCENT", found: 51, limit: 50 });
    });

    it("accepts a surcharge sum of exactly 100 and rejects 101", () => {
      const ok = [
        rule({ id: 1, type: "surcharge", percent: 60, startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 2, type: "surcharge", percent: 40, startDate: TODAY, endDate: d("2026-01-20") }),
      ];
      expect(validateRuleSet(ok, TODAY, LIMITS)).toEqual([]);

      const bad = [
        rule({ id: 1, type: "surcharge", percent: 60, startDate: TODAY, endDate: d("2026-01-20") }),
        rule({ id: 2, type: "surcharge", percent: 41, startDate: TODAY, endDate: d("2026-01-20") }),
      ];
      const violations = validateRuleSet(bad, TODAY, LIMITS);
      expect(violations[0]).toMatchObject({ type: "surcharge", reason: "MAX_PERCENT", found: 101 });
    });
  });

  // ==================================================================
  // overlaps
  // ==================================================================
  describe("weekday / dateRange overlaps", () => {
    it("detects a weekday-vs-weekday overlap", () => {
      const rules = [1, 2, 3].map((id) =>
        rule({ id, kind: "weekday", weekdays: [3], startDate: null, endDate: null }),
      );
      const violations = validateRuleSet(rules, TODAY, LIMITS);

      // هر چهارشنبه یک بازه‌ی جداگانه است (روزها پیوسته نیستند).
      expect(violations.length).toBeGreaterThan(1);
      expect(violations[0]).toMatchObject({ reason: "MAX_COUNT", found: 3, limit: 2 });
      // اولین چهارشنبه بعد از TODAY = 2026-01-07
      expect(ymd(violations[0].from)).toBe("2026-01-07");
      expect(ymd(violations[0].to)).toBe("2026-01-07");
    });

    it("detects a weekday-vs-dateRange overlap", () => {
      const rules = [
        rule({ id: 1, kind: "weekday", weekdays: [3], startDate: null, endDate: null }),
        rule({ id: 2, startDate: d("2026-01-07"), endDate: d("2026-01-07") }),
        rule({ id: 3, startDate: d("2026-01-07"), endDate: d("2026-01-07") }),
      ];
      const violations = validateRuleSet(rules, TODAY, LIMITS);

      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ reason: "MAX_COUNT", found: 3 });
      expect(ymd(violations[0].from)).toBe("2026-01-07");
      expect(ymd(violations[0].to)).toBe("2026-01-07");
    });

    it("merges only the consecutive conflicting days into one range", () => {
      const rules = [
        rule({ id: 1, startDate: d("2026-01-05"), endDate: d("2026-01-20") }),
        rule({ id: 2, startDate: d("2026-01-05"), endDate: d("2026-01-20") }),
        rule({ id: 3, startDate: d("2026-01-10"), endDate: d("2026-01-15") }),
      ];
      const violations = validateRuleSet(rules, TODAY, LIMITS);

      expect(violations).toHaveLength(1);
      expect(ymd(violations[0].from)).toBe("2026-01-10");
      expect(ymd(violations[0].to)).toBe("2026-01-15");
    });
  });

  // ==================================================================
  // ignore inactive + horizon
  // ==================================================================
  describe("inactive rules and horizon", () => {
    it("ignores deactivated rules", () => {
      const rules = [1, 2, 3].map((id) =>
        rule({
          id,
          isActive: id !== 3,
          startDate: d("2026-01-05"),
          endDate: d("2026-01-15"),
        }),
      );
      expect(validateRuleSet(rules, TODAY, LIMITS)).toEqual([]);
    });

    it("reports the horizon boundary at exactly today + PRICE_RULE_MAX_FUTURE_DAYS", () => {
      const end = new Date(TODAY.getTime() + LIMITS.priceRuleMaxFutureDays * 86_400_000);
      const rules = [1, 2, 3].map((id) => rule({ id, startDate: TODAY, endDate: end }));
      const violations = validateRuleSet(rules, TODAY, LIMITS);

      expect(ymd(violations[0].to)).toBe(ymd(end));
    });

    it("extends the horizon when a stored rule ends beyond today + PRICE_RULE_MAX_FUTURE_DAYS", () => {
      const far = new Date(TODAY.getTime() + 400 * 86_400_000);
      const rules = [1, 2, 3].map((id) => rule({ id, startDate: TODAY, endDate: far }));
      const violations = validateRuleSet(rules, TODAY, LIMITS);

      expect(ymd(violations[0].to)).toBe(ymd(far));
    });
  });
});

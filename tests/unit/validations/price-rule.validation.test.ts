import { describe, it, expect } from "vitest";
import {
  bulkCreatePriceRulesSchema,
  createCabinPriceRuleSchema,
  updatePriceRuleBodySchema,
} from "../../../src/validations/price-rule.validation.js";
import { currentSettings } from "../../../src/cache/setting.store.js";

const dateRangeRule = {
  type: "discount",
  kind: "dateRange",
  percent: 20,
  startDate: "2026-06-05",
  endDate: "2026-06-10",
};

const weekdayRule = {
  type: "surcharge",
  kind: "weekday",
  percent: 15,
  weekdays: [3, 4, 5],
};

describe("price-rule.validation", () => {
  describe("createPriceRuleBodySchema", () => {
    it("accepts a valid dateRange rule and parses dates to UTC midnight", () => {
      const result = createCabinPriceRuleSchema(currentSettings()).body.parse(dateRangeRule);
      expect(result.startDate?.toISOString()).toBe("2026-06-05T00:00:00.000Z");
      expect(result.endDate?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    });

    it("accepts a valid weekday rule", () => {
      expect(
        createCabinPriceRuleSchema(currentSettings()).body.parse(weekdayRule).weekdays,
      ).toEqual([3, 4, 5]);
    });

    it("coerces numeric strings for percent and weekdays", () => {
      const result = createCabinPriceRuleSchema(currentSettings()).body.parse({
        ...weekdayRule,
        percent: "15",
        weekdays: ["3", "4"],
      });
      expect(result.percent).toBe(15);
      expect(result.weekdays).toEqual([3, 4]);
    });

    it("requires startDate/endDate for a dateRange rule", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          type: "discount",
          kind: "dateRange",
          percent: 10,
        }),
      ).toThrow(/startDate is required/);
    });

    it("rejects weekdays on a dateRange rule", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...dateRangeRule,
          weekdays: [3],
        }),
      ).toThrow(/weekdays must not be provided/);
    });

    it("requires weekdays for a weekday rule", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          type: "surcharge",
          kind: "weekday",
          percent: 10,
        }),
      ).toThrow(/weekdays is required/);
    });

    it("rejects dates on a weekday rule", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...weekdayRule,
          startDate: "2026-06-05",
        }),
      ).toThrow(/must not be provided/);
    });

    it("rejects startDate after endDate", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...dateRangeRule,
          startDate: "2026-06-11",
        }),
      ).toThrow(/startDate must be before or equal to endDate/);
    });

    it("enforces the discount percent cap (50)", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({ ...dateRangeRule, percent: 51 }),
      ).toThrow(/cannot exceed 50/);
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({ ...dateRangeRule, percent: 50 }),
      ).not.toThrow();
    });

    it("enforces the surcharge percent cap (100)", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...weekdayRule,
          type: "surcharge",
          percent: 101,
        }),
      ).toThrow(/cannot exceed 100/);
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...weekdayRule,
          type: "surcharge",
          percent: 100,
        }),
      ).not.toThrow();
    });

    it("rejects percent below 1 and non-integers", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({ ...dateRangeRule, percent: 0 }),
      ).toThrow();
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...dateRangeRule,
          percent: 1.5,
        }),
      ).toThrow();
    });

    it("rejects duplicate and out-of-range weekdays", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...weekdayRule,
          weekdays: [3, 3],
        }),
      ).toThrow(/duplicates/);
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({ ...weekdayRule, weekdays: [0] }),
      ).toThrow();
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({ ...weekdayRule, weekdays: [8] }),
      ).toThrow();
    });

    it("rejects a label longer than 100 characters", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...dateRangeRule,
          label: "x".repeat(101),
        }),
      ).toThrow(/label/);
    });

    it("rejects unknown/immutable keys (strict)", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({ ...dateRangeRule, cabinId: 1 }),
      ).toThrow();
    });

    it("rejects an invalid date format", () => {
      expect(() =>
        createCabinPriceRuleSchema(currentSettings()).body.parse({
          ...dateRangeRule,
          endDate: "2026-02-30",
        }),
      ).toThrow(/Invalid calendar date/);
    });
  });

  describe("updatePriceRuleBodySchema", () => {
    it("accepts a partial update", () => {
      expect(updatePriceRuleBodySchema.parse({ percent: 25 }).percent).toBe(25);
      expect(updatePriceRuleBodySchema.parse({ isActive: false }).isActive).toBe(false);
    });

    it("rejects an empty body", () => {
      expect(() => updatePriceRuleBodySchema.parse({})).toThrow(/At least one field/);
    });

    it("rejects immutable keys (type/kind/cabinId)", () => {
      expect(() => updatePriceRuleBodySchema.parse({ type: "surcharge" })).toThrow();
      expect(() => updatePriceRuleBodySchema.parse({ cabinId: 2 })).toThrow();
    });

    it("allows setting label to null", () => {
      expect(updatePriceRuleBodySchema.parse({ label: null }).label).toBeNull();
    });
  });

  describe("bulkCreatePriceRulesBodySchema", () => {
    it("accepts allCabins with a rule", () => {
      const parsed = bulkCreatePriceRulesSchema(currentSettings()).body.parse({
        allCabins: true,
        rule: dateRangeRule,
      });
      expect(parsed.allCabins).toBe(true);
    });

    it("accepts cabinIds with a rule", () => {
      const parsed = bulkCreatePriceRulesSchema(currentSettings()).body.parse({
        cabinIds: [1, 2],
        rule: weekdayRule,
      });
      expect(parsed.cabinIds).toEqual([1, 2]);
    });

    it("rejects when both cabinIds and allCabins are provided", () => {
      expect(() =>
        bulkCreatePriceRulesSchema(currentSettings()).body.parse({
          cabinIds: [1],
          allCabins: true,
          rule: dateRangeRule,
        }),
      ).toThrow(/Exactly one/);
    });

    it("rejects when neither is provided", () => {
      expect(() =>
        bulkCreatePriceRulesSchema(currentSettings()).body.parse({ rule: dateRangeRule }),
      ).toThrow(/Exactly one/);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  assertConsistent,
  updateSettingsBodySchema,
  updateSettingsFields,
} from "../../../src/validations/setting.validation.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/setting.constants.js";

const body = updateSettingsBodySchema;
const base = { ...DEFAULT_SETTINGS };

// ==================================================================
// Zod schema
// ==================================================================
describe("setting.validation > updateSettingsBodySchema", () => {
  it("accepts a valid partial body", () => {
    expect(body.safeParse({ maxBookingLength: 20 }).success).toBe(true);
    expect(body.safeParse({ maxGuests: 5, paymentDeadlineMinutes: 45 }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(body.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(body.safeParse({ breakfastPrice: 10 }).success).toBe(false);
    expect(body.safeParse({ minBookingLength: 2, foo: 1 }).success).toBe(false);
  });

  it("coerces numeric strings", () => {
    const result = body.safeParse({ maxGuests: "5" });
    expect(result.success).toBe(true);
    expect(result.data!.maxGuests).toBe(5);
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["an array", []],
    ["a boolean", true],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a non-numeric string", "abc"],
    ["a hex string", "0x10"],
  ])("rejects %s for a numeric field", (_label, value) => {
    expect(body.safeParse({ maxGuests: value }).success).toBe(false);
  });

  it("does not report a 'must be at least' message for a non-numeric value", () => {
    const result = body.safeParse({ maxGuests: "abc" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => issue.message);
    expect(messages.some((message) => message.includes("must be a number"))).toBe(true);
    expect(messages.some((message) => message.includes("must be at least"))).toBe(false);
  });

  it("rejects non-integers and values below the minimum", () => {
    expect(body.safeParse({ maxGuests: 1.5 }).success).toBe(false);
    expect(body.safeParse({ maxGuests: 0 }).success).toBe(false);
    expect(body.safeParse({ minBookingLength: 0 }).success).toBe(false);
    expect(body.safeParse({ maxPendingBookingsPerGuest: -1 }).success).toBe(false);
    expect(body.safeParse({ maxDiscountsPerNight: -1 }).success).toBe(false);
  });

  it("allows zero for count-like limits", () => {
    expect(body.safeParse({ maxPendingBookingsPerGuest: 0 }).success).toBe(true);
    expect(body.safeParse({ maxSurchargesPerNight: 0 }).success).toBe(true);
  });

  it.each([
    ["maxAdvanceBookingDays", 366],
    ["priceRuleMaxFutureDays", 3651],
    ["paymentDeadlineMinutes", 10_081],
    ["maxGuests", 101],
    ["maxBookingLength", 366],
    ["maxDiscountsPerNight", 11],
    ["maxSurchargesPerNight", 11],
    ["maxTotalDiscountPercent", 101],
    ["maxTotalSurchargePercent", 1001],
  ])("rejects %s above its upper bound", (field, value) => {
    expect(body.safeParse({ [field]: value }).success).toBe(false);
  });

  it("accepts every upper bound exactly", () => {
    expect(body.safeParse({ maxAdvanceBookingDays: 365 }).success).toBe(true);
    expect(body.safeParse({ priceRuleMaxFutureDays: 3650 }).success).toBe(true);
    expect(body.safeParse({ paymentDeadlineMinutes: 10_080 }).success).toBe(true);
    expect(body.safeParse({ maxGuests: 100 }).success).toBe(true);
    expect(body.safeParse({ maxTotalDiscountPercent: 100 }).success).toBe(true);
    expect(body.safeParse({ maxTotalSurchargePercent: 1000 }).success).toBe(true);
  });

  it("has a schema field for every setting column", () => {
    const schemaKeys = new Set(Object.keys(updateSettingsFields.shape));
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(schemaKeys.has(key)).toBe(true);
    }
    expect(schemaKeys.size).toBe(Object.keys(DEFAULT_SETTINGS).length);
  });
});

// ==================================================================
// assertConsistent (pure cross-field rules)
// ==================================================================
describe("setting.validation > assertConsistent", () => {
  it("accepts the defaults", () => {
    expect(() => assertConsistent(base)).not.toThrow();
  });

  it("enforces minBookingLength <= maxBookingLength at the boundary", () => {
    expect(() => assertConsistent({ ...base, minBookingLength: 30, maxBookingLength: 30 })).not.toThrow();
    expect(() => assertConsistent({ ...base, minBookingLength: 31 })).toThrow(
      /maxBookingLength must be greater than or equal to minBookingLength/,
    );
  });

  it("enforces startingPriceWindowDays <= maxAdvanceBookingDays at the boundary", () => {
    expect(() =>
      assertConsistent({ ...base, startingPriceWindowDays: 120, maxAdvanceBookingDays: 120 }),
    ).not.toThrow();
    expect(() => assertConsistent({ ...base, startingPriceWindowDays: 121 })).toThrow(
      /startingPriceWindowDays cannot exceed maxAdvanceBookingDays/,
    );
  });

  it("enforces minRegularPrice <= maxRegularPrice at the boundary", () => {
    expect(() =>
      assertConsistent({ ...base, minRegularPrice: 1_000_000, maxRegularPrice: 1_000_000 }),
    ).not.toThrow();
    expect(() => assertConsistent({ ...base, minRegularPrice: 36_000_000 })).toThrow(
      /maxRegularPrice must be greater than or equal to minRegularPrice|derived from maxNightlyPrice/,
    );
  });

  it("enforces maxNightlyPrice >= minRegularPrice", () => {
    // maxNightlyPrice=2M، surcharge=100 → maxRegularPrice مشتق = 1M.
    expect(() =>
      assertConsistent({
        ...base,
        maxNightlyPrice: 2_000_000,
        minRegularPrice: 1_000_000,
        maxRegularPrice: 1_000_000,
      }),
    ).not.toThrow();
    expect(() =>
      assertConsistent({ ...base, maxNightlyPrice: 999_999, minRegularPrice: 1_000_000 }),
    ).toThrow(/maxNightlyPrice must be greater than or equal to minRegularPrice/);
  });

  it("enforces the derived maxRegularPrice at the boundary", () => {
    // defaults: floor(70_000_000 * 100 / 200) = 35_000_000
    expect(() => assertConsistent({ ...base, maxRegularPrice: 35_000_000 })).not.toThrow();
    expect(() => assertConsistent({ ...base, maxRegularPrice: 35_000_001 })).toThrow(
      /derived from maxNightlyPrice/,
    );
  });

  it("names the fields involved when only the surcharge percent changed", () => {
    expect(() => assertConsistent({ ...base, maxTotalSurchargePercent: 200 })).toThrow(
      /maxRegularPrice \(35000000\) exceeds the allowed maximum 23333333 derived from maxNightlyPrice \(70000000\) and maxTotalSurchargePercent \(200\)/,
    );
  });

  it("enforces the int4 overflow rule at the boundary", () => {
    // 30 * 70_000_000 = 2_100_000_000 <= 2_147_483_647
    expect(() => assertConsistent({ ...base, maxBookingLength: 30 })).not.toThrow();
    // 31 * 70_000_000 = 2_170_000_000 > 2_147_483_647
    expect(() => assertConsistent({ ...base, maxBookingLength: 31 })).toThrow(
      /exceeds the maximum integer/,
    );
  });
});

import { describe, it, expect } from "vitest";
import { updateSettingsSchema } from "../../../src/validations/setting.validation.js";

const body = updateSettingsSchema.body;

describe("setting.validation", () => {
  it("accepts a valid partial update", () => {
    expect(body.safeParse({ maxBookingLength: 20 }).success).toBe(true);
    expect(body.safeParse({ maxTotalDiscountPercent: 0 }).success).toBe(true);
    expect(body.safeParse({ maxGuests: 5, paymentDeadlineMinutes: 45 }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(body.safeParse({}).success).toBe(false);
  });

  it("coerces numeric strings (form/query style)", () => {
    const result = body.safeParse({ maxGuests: "5" });
    expect(result.success).toBe(true);
    expect(result.data!.maxGuests).toBe(5);
  });

  it("rejects unknown keys (strict)", () => {
    expect(body.safeParse({ breakfastPrice: 10 }).success).toBe(false);
    expect(body.safeParse({ minBookingLength: 2, foo: 1 }).success).toBe(false);
  });

  it("rejects non-integer and below-minimum values", () => {
    expect(body.safeParse({ maxGuests: 1.5 }).success).toBe(false);
    expect(body.safeParse({ maxGuests: 0 }).success).toBe(false);
    expect(body.safeParse({ minBookingLength: 0 }).success).toBe(false);
    expect(body.safeParse({ maxAdvanceBookingDays: 0 }).success).toBe(false);
    expect(body.safeParse({ maxPendingBookingsPerGuest: -1 }).success).toBe(false);
    expect(body.safeParse({ maxDiscountsPerNight: -1 }).success).toBe(false);
  });

  it("caps maxTotalDiscountPercent at 100", () => {
    expect(body.safeParse({ maxTotalDiscountPercent: 101 }).success).toBe(false);
    expect(body.safeParse({ maxTotalDiscountPercent: 100 }).success).toBe(true);
  });

  it("allows zero for count-like limits", () => {
    expect(body.safeParse({ maxPendingBookingsPerGuest: 0 }).success).toBe(true);
    expect(body.safeParse({ maxSurchargesPerNight: 0 }).success).toBe(true);
  });
});

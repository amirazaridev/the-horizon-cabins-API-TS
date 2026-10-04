import { describe, it, expect } from "vitest";
import {
  MAX_ADVANCE_BOOKING_DAYS,
  MAX_BOOKING_LENGTH_NIGHTS,
  MAX_NIGHTLY_PRICE,
  MAX_REGULAR_PRICE,
  MAX_TOTAL_DISCOUNT_PERCENT,
  MAX_TOTAL_SURCHARGE_PERCENT,
  MIN_REGULAR_PRICE,
  PRICE_CALENDAR_HORIZON_DAYS,
  getPricingLimits,
} from "../../../src/constants/pricing.constants.js";

describe("pricing.constants", () => {
  it("keeps the worst-case stay total within a 32-bit Int", () => {
    // totalPrice ستون Int است؛ ضرب بزرگ‌ترین قیمت شب در بلندترین اقامت باید جا شود.
    expect(MAX_NIGHTLY_PRICE * MAX_BOOKING_LENGTH_NIGHTS).toBeLessThanOrEqual(2_147_483_647);
  });

  it("derives MAX_REGULAR_PRICE so the maximum surcharge still fits MAX_NIGHTLY_PRICE", () => {
    expect(MAX_REGULAR_PRICE * (1 + MAX_TOTAL_SURCHARGE_PERCENT / 100)).toBeLessThanOrEqual(
      MAX_NIGHTLY_PRICE,
    );
    expect(MAX_REGULAR_PRICE).toBe(35_000_000);
    expect(MIN_REGULAR_PRICE).toBe(1_000_000);
  });

  it("uses the reduced 120-day booking horizon for the price calendar", () => {
    expect(MAX_ADVANCE_BOOKING_DAYS).toBe(120);
    expect(PRICE_CALENDAR_HORIZON_DAYS).toBe(MAX_ADVANCE_BOOKING_DAYS);
  });

  it("exposes limits through the async getter", async () => {
    const limits = await getPricingLimits();
    expect(limits).toMatchObject({
      maxDiscountsPerNight: 2,
      maxSurchargesPerNight: 2,
      maxTotalDiscountPercent: MAX_TOTAL_DISCOUNT_PERCENT,
      maxTotalSurchargePercent: MAX_TOTAL_SURCHARGE_PERCENT,
      maxNightlyPrice: MAX_NIGHTLY_PRICE,
      minRegularPrice: MIN_REGULAR_PRICE,
      maxRegularPrice: MAX_REGULAR_PRICE,
      maxAdvanceBookingDays: 120,
      startingPriceWindowDays: 30,
      priceRuleMaxFutureDays: 365,
    });
  });
});

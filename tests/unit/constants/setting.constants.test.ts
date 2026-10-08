import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  INT4_MAX,
  SETTINGS_FIELDS,
} from "../../../src/constants/setting.constants.js";
import { deriveMaxRegularPrice } from "../../../src/utils/price-limits.util.js";
import {
  deriveSettings,
  getPricingLimits,
  resetSettingsCache,
} from "../../../src/cache/setting.store.js";

describe("setting.constants", () => {
  it("keeps the worst-case stay total within int4", () => {
    expect(DEFAULT_SETTINGS.maxBookingLength * DEFAULT_SETTINGS.maxNightlyPrice).toBeLessThanOrEqual(
      INT4_MAX,
    );
  });

  it("derives maxRegularPrice so the maximum surcharge still fits maxNightlyPrice", () => {
    expect(
      deriveMaxRegularPrice(
        DEFAULT_SETTINGS.maxNightlyPrice,
        DEFAULT_SETTINGS.maxTotalSurchargePercent,
      ),
    ).toBe(35_000_000);
    expect(DEFAULT_SETTINGS.maxRegularPrice).toBe(35_000_000);
  });

  it("lists every default column in SETTINGS_FIELDS", () => {
    expect([...SETTINGS_FIELDS].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(SETTINGS_FIELDS).toHaveLength(15);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });

  it("exposes the defaults through the store getter", () => {
    resetSettingsCache();
    expect(getPricingLimits()).toMatchObject({
      maxDiscountsPerNight: 2,
      maxSurchargesPerNight: 2,
      maxTotalDiscountPercent: 50,
      maxTotalSurchargePercent: 100,
      maxNightlyPrice: 70_000_000,
      minRegularPrice: 1_000_000,
      maxRegularPrice: 35_000_000,
      priceCalendarHorizonDays: 120,
      startingPriceWindowDays: 30,
      priceRuleMaxFutureDays: 365,
    });
  });

  it("derives horizon and booked-dates range from maxAdvanceBookingDays", () => {
    const derived = deriveSettings({ ...DEFAULT_SETTINGS, maxAdvanceBookingDays: 90 });
    expect(derived.priceCalendarHorizonDays).toBe(90);
    expect(derived.bookedDatesMaxRangeDays).toBe(91);
  });
});

describe("deriveMaxRegularPrice", () => {
  it.each([
    [70_000_000, 100, 35_000_000],
    [70_000_000, 15, Math.floor((70_000_000 * 100) / 115)],
    [100, 7, Math.floor(10_000 / 107)],
    [33, 33, Math.floor(3_300 / 133)],
  ])("deriveMaxRegularPrice(%i, %i) = %i", (max, surcharge, expected) => {
    expect(deriveMaxRegularPrice(max, surcharge)).toBe(expected);
  });
});

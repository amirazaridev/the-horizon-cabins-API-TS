import { describe, it, expect, beforeEach } from "vitest";
import {
  applySettingsRow,
  currentSettings,
  deriveSettings,
  getPricingLimits,
  resetSettingsCache,
  toPricingLimits,
} from "../../../src/cache/setting.store.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/setting.constants.js";
import type { SettingsColumns } from "../../../src/types/setting.types.js";
import type { Setting } from "../../../src/generated/prisma/client.js";

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

function rowFrom(columns: SettingsColumns, updatedAt: Date): Setting {
  return { id: 1, ...columns, createdAt: CREATED_AT, updatedAt } as Setting;
}

describe("setting.store", () => {
  beforeEach(() => resetSettingsCache());

  it("derives horizon and booked-dates range from maxAdvanceBookingDays", () => {
    const settings = deriveSettings({ ...DEFAULT_SETTINGS, maxAdvanceBookingDays: 90 });
    expect(settings.priceCalendarHorizonDays).toBe(90);
    expect(settings.bookedDatesMaxRangeDays).toBe(91);
  });

  it("returns frozen settings and limits", () => {
    expect(Object.isFrozen(deriveSettings(DEFAULT_SETTINGS))).toBe(true);
    expect(Object.isFrozen(currentSettings())).toBe(true);
    expect(Object.isFrozen(getPricingLimits())).toBe(true);
  });

  it("resetSettingsCache restores the defaults", () => {
    applySettingsRow(
      rowFrom({ ...DEFAULT_SETTINGS, maxGuests: 42 }, new Date("2026-02-01T00:00:00.000Z")),
    );
    expect(currentSettings().maxGuests).toBe(42);

    resetSettingsCache();
    expect(currentSettings().maxGuests).toBe(DEFAULT_SETTINGS.maxGuests);
  });

  it("does not roll the cache back when an older row is applied", () => {
    const newer = new Date("2026-03-01T00:00:00.000Z");
    const older = new Date("2026-01-01T00:00:00.000Z");

    applySettingsRow(rowFrom({ ...DEFAULT_SETTINGS, maxGuests: 20 }, newer));
    applySettingsRow(rowFrom({ ...DEFAULT_SETTINGS, maxGuests: 5 }, older));

    expect(currentSettings().maxGuests).toBe(20);
  });

  it("applies a row whose updatedAt equals the cached one", () => {
    const sameInstant = new Date("2026-03-01T00:00:00.000Z");
    applySettingsRow(rowFrom({ ...DEFAULT_SETTINGS, maxGuests: 20 }, sameInstant));
    applySettingsRow(rowFrom({ ...DEFAULT_SETTINGS, maxGuests: 25 }, sameInstant));
    expect(currentSettings().maxGuests).toBe(25);
  });

  it("maps settings to pricing limits", () => {
    const limits = toPricingLimits(deriveSettings(DEFAULT_SETTINGS));
    expect(limits.maxNightlyPrice).toBe(DEFAULT_SETTINGS.maxNightlyPrice);
    expect(limits.minRegularPrice).toBe(DEFAULT_SETTINGS.minRegularPrice);
    expect(limits.priceCalendarHorizonDays).toBe(DEFAULT_SETTINGS.maxAdvanceBookingDays);
  });
});

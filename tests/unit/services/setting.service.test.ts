import { describe, it, expect, vi, beforeEach } from "vitest";
import * as settingService from "../../../src/services/setting.service.js";
import * as settingRepository from "../../../src/repositories/setting.repository.js";
import * as priceCalendarService from "../../../src/services/price-calendar.service.js";
import { currentSettings, resetSettingsCache } from "../../../src/services/setting.store.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/settings.constants.js";
import { ErrorCode } from "../../../src/constants/errorCodes.js";
import type { SettingsColumns } from "../../../src/types/setting.types.js";
import type { Setting } from "../../../src/generated/prisma/client.js";

// repository و بازسازی تقویم mock می‌شوند؛ تست‌های unit نباید به دیتابیس بزنند.
vi.mock("../../../src/repositories/setting.repository.js");
vi.mock("../../../src/services/price-calendar.service.js");

/** ردیف Prisma از ستون‌های تنظیمات. */
function rowFrom(columns: SettingsColumns): Setting {
  return {
    id: 1,
    ...columns,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as Setting;
}

describe("setting.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSettingsCache();
  });

  // ------------------------------------------------------------------
  // getSettings
  // ------------------------------------------------------------------
  describe("getSettings", () => {
    it("creates the singleton row with defaults when none exists", async () => {
      vi.mocked(settingRepository.findSettings).mockResolvedValue(null);
      vi.mocked(settingRepository.createSettings).mockImplementation(async (data) => rowFrom(data));

      const settings = await settingService.getSettings();

      expect(settingRepository.createSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS);
      expect(settings).toMatchObject({
        ...DEFAULT_SETTINGS,
        priceCalendarHorizonDays: 120,
        bookedDatesMaxRangeDays: 121,
      });
    });

    it("returns the existing row and derives horizon/range from maxAdvanceBookingDays", async () => {
      vi.mocked(settingRepository.findSettings).mockResolvedValue(
        rowFrom({ ...DEFAULT_SETTINGS, maxAdvanceBookingDays: 90 }),
      );

      const settings = await settingService.getSettings();

      expect(settingRepository.createSettings).not.toHaveBeenCalled();
      expect(settings.maxAdvanceBookingDays).toBe(90);
      expect(settings.priceCalendarHorizonDays).toBe(90);
      expect(settings.bookedDatesMaxRangeDays).toBe(91);
    });
  });

  // ------------------------------------------------------------------
  // updateSettings
  // ------------------------------------------------------------------
  describe("updateSettings", () => {
    beforeEach(() => {
      vi.mocked(settingRepository.saveSettings).mockImplementation(async (data) => rowFrom(data));
    });

    it("merges a partial update over current settings and refreshes the cache", async () => {
      const result = await settingService.updateSettings({ maxBookingLength: 15 });

      expect(settingRepository.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          maxBookingLength: 15,
          minBookingLength: DEFAULT_SETTINGS.minBookingLength,
        }),
      );
      expect(result.settings.maxBookingLength).toBe(15);
      expect(currentSettings().maxBookingLength).toBe(15);
      expect(result.calendarRowsRebuilt).toBeUndefined();
      expect(priceCalendarService.rebuildAllCabinPriceCalendars).not.toHaveBeenCalled();
    });

    it("rebuilds the price calendar when a pricing-affecting field changes", async () => {
      vi.mocked(priceCalendarService.rebuildAllCabinPriceCalendars).mockResolvedValue(240);

      const result = await settingService.updateSettings({ maxTotalDiscountPercent: 40 });

      expect(priceCalendarService.rebuildAllCabinPriceCalendars).toHaveBeenCalledTimes(1);
      expect(result.calendarRowsRebuilt).toBe(240);
    });

    it("does not rebuild for a non-pricing field", async () => {
      const result = await settingService.updateSettings({ paymentDeadlineMinutes: 45 });

      expect(priceCalendarService.rebuildAllCabinPriceCalendars).not.toHaveBeenCalled();
      expect(result.calendarRowsRebuilt).toBeUndefined();
      expect(currentSettings().paymentDeadlineMinutes).toBe(45);
    });

    it("rejects maxBookingLength below minBookingLength with 400 SETTINGS_INVALID", async () => {
      await expect(settingService.updateSettings({ maxBookingLength: 0 })).rejects.toMatchObject({
        code: ErrorCode.SETTINGS_INVALID,
      });
      expect(settingRepository.saveSettings).not.toHaveBeenCalled();
    });

    it("rejects maxRegularPrice above the value implied by maxNightlyPrice/maxSurcharge", async () => {
      await expect(
        settingService.updateSettings({ maxRegularPrice: 36_000_000 }),
      ).rejects.toMatchObject({ code: ErrorCode.SETTINGS_INVALID });
      expect(settingRepository.saveSettings).not.toHaveBeenCalled();
    });

    it("accepts a consistent pricing update", async () => {
      const result = await settingService.updateSettings({ maxRegularPrice: 30_000_000 });
      expect(result.settings.maxRegularPrice).toBe(30_000_000);
    });
  });
});

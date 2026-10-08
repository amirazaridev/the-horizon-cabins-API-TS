import { describe, it, expect, vi, beforeEach } from "vitest";
import * as settingService from "../../../src/services/setting.service.js";
import * as settingRepository from "../../../src/repositories/setting.repository.js";
import * as cabinRepository from "../../../src/repositories/cabin.repository.js";
import * as priceRuleRepository from "../../../src/repositories/price-rule.repository.js";
import * as bookingRepository from "../../../src/repositories/booking.repository.js";
import * as priceCalendarService from "../../../src/services/price-calendar.service.js";
import { currentSettings, resetSettingsCache } from "../../../src/cache/setting.store.js";
import { assertConsistent } from "../../../src/validations/setting.validation.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/setting.constants.js";
import { ErrorCode } from "../../../src/constants/errorCodes.js";
import { HTTP_STATUS } from "../../../src/constants/httpStatus.js";
import type { SettingsColumns } from "../../../src/types/setting.types.js";
import type { Setting } from "../../../src/generated/prisma/client.js";

// repositoryها و بازسازی تقویم mock می‌شوند؛ تست unit نباید به دیتابیس بزند.
vi.mock("../../../src/repositories/setting.repository.js");
vi.mock("../../../src/repositories/cabin.repository.js");
vi.mock("../../../src/repositories/price-rule.repository.js");
vi.mock("../../../src/repositories/booking.repository.js");
vi.mock("../../../src/services/price-calendar.service.js");

// prisma.$transaction فقط callback تراکنش را با یک tx ساختگی اجرا می‌کند.
vi.mock("../../../src/config/database.js", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

/** ردیف Prisma از ستون‌های تنظیمات. */
function rowFrom(columns: SettingsColumns, updatedAt: Date = CREATED_AT): Setting {
  return { id: 1, ...columns, createdAt: CREATED_AT, updatedAt } as Setting;
}

describe("setting.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSettingsCache();
    vi.mocked(settingRepository.ensureSettings).mockResolvedValue(rowFrom(DEFAULT_SETTINGS));
    vi.mocked(settingRepository.updateSettings).mockImplementation(async (data) =>
      rowFrom({ ...DEFAULT_SETTINGS, ...data }, new Date("2026-02-01T00:00:00.000Z")),
    );
    vi.mocked(cabinRepository.countCabinsOutsidePriceRange).mockResolvedValue(0);
    vi.mocked(priceRuleRepository.countActiveRulesAbovePercent).mockResolvedValue(0);
    vi.mocked(bookingRepository.countUpcomingBookingsAboveGuests).mockResolvedValue(0);
  });

  // ------------------------------------------------------------------
  // getSettings
  // ------------------------------------------------------------------
  describe("getSettings", () => {
    it("ensures the singleton row and returns the effective settings", async () => {
      vi.mocked(settingRepository.ensureSettings).mockResolvedValue(
        rowFrom({ ...DEFAULT_SETTINGS, maxAdvanceBookingDays: 90 }),
      );

      const settings = await settingService.getSettings();

      expect(settings.maxAdvanceBookingDays).toBe(90);
      expect(settings.priceCalendarHorizonDays).toBe(90);
      expect(settings.bookedDatesMaxRangeDays).toBe(91);
      expect(currentSettings().maxAdvanceBookingDays).toBe(90);
    });
  });

  // ------------------------------------------------------------------
  // updateSettings
  // ------------------------------------------------------------------
  describe("updateSettings", () => {
    it("writes only the changed fields (partial update) and refreshes the cache", async () => {
      const result = await settingService.updateSettings({ maxBookingLength: 15 });

      expect(settingRepository.updateSettings).toHaveBeenCalledWith(
        { maxBookingLength: 15 },
        expect.anything(),
      );
      expect(result.settings.maxBookingLength).toBe(15);
      expect(currentSettings().maxBookingLength).toBe(15);
      expect(result.calendarRowsRebuilt).toBeUndefined();
      expect(priceCalendarService.rebuildAllCabinPriceCalendars).not.toHaveBeenCalled();
    });

    it("is a no-op when no field actually changes", async () => {
      const result = await settingService.updateSettings({
        maxBookingLength: DEFAULT_SETTINGS.maxBookingLength,
      });

      expect(settingRepository.updateSettings).not.toHaveBeenCalled();
      expect(priceCalendarService.rebuildAllCabinPriceCalendars).not.toHaveBeenCalled();
      expect(result.calendarRowsRebuilt).toBeUndefined();
      expect(result.settings.maxBookingLength).toBe(DEFAULT_SETTINGS.maxBookingLength);
    });

    it("rebuilds the price calendar once when a pricing-affecting field changes", async () => {
      vi.mocked(priceCalendarService.rebuildAllCabinPriceCalendars).mockResolvedValue(240);

      const result = await settingService.updateSettings({ maxTotalDiscountPercent: 40 });

      expect(priceCalendarService.rebuildAllCabinPriceCalendars).toHaveBeenCalledTimes(1);
      expect(result.calendarRowsRebuilt).toBe(240);
      expect(result.calendarRebuild).toBeUndefined();
    });

    it("does not rebuild for a non-pricing field", async () => {
      const result = await settingService.updateSettings({ paymentDeadlineMinutes: 45 });

      expect(priceCalendarService.rebuildAllCabinPriceCalendars).not.toHaveBeenCalled();
      expect(result.calendarRowsRebuilt).toBeUndefined();
    });

    it("keeps the saved settings and reports failure when the rebuild throws", async () => {
      vi.mocked(priceCalendarService.rebuildAllCabinPriceCalendars).mockRejectedValue(
        new Error("boom"),
      );

      const result = await settingService.updateSettings({ maxTotalDiscountPercent: 40 });

      expect(result.settings.maxTotalDiscountPercent).toBe(40);
      expect(result.calendarRebuild).toEqual({ status: "failed" });
      expect(result.calendarRowsRebuilt).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // assertConsistent (pure)
  // ------------------------------------------------------------------
  describe("assertConsistent", () => {
    const base = { ...DEFAULT_SETTINGS };

    it("accepts the defaults", () => {
      expect(() => assertConsistent(base)).not.toThrow();
    });

    it("rejects maxBookingLength below minBookingLength", () => {
      expect(() => assertConsistent({ ...base, maxBookingLength: 0 })).toThrow(
        /maxBookingLength must be greater than or equal to minBookingLength/,
      );
    });

    it("rejects startingPriceWindowDays above maxAdvanceBookingDays", () => {
      expect(() =>
        assertConsistent({ ...base, startingPriceWindowDays: 200 }),
      ).toThrow(/startingPriceWindowDays cannot exceed maxAdvanceBookingDays/);
    });

    it("rejects maxRegularPrice above the derived maximum", () => {
      expect(() =>
        assertConsistent({ ...base, maxRegularPrice: 36_000_000 }),
      ).toThrow(/derived from maxNightlyPrice/);
    });

    it("allows 30 nights with the defaults but rejects 31 (int4 overflow)", () => {
      expect(() =>
        assertConsistent({ ...base, maxBookingLength: 30 }),
      ).not.toThrow();
      expect(() => assertConsistent({ ...base, maxBookingLength: 31 })).toThrow(
        /exceeds the maximum integer/,
      );
    });
  });

  // ------------------------------------------------------------------
  // existing-data guard
  // ------------------------------------------------------------------
  describe("existing-data guard", () => {
    it("rejects a change that would invalidate existing cabins, with a count", async () => {
      vi.mocked(cabinRepository.countCabinsOutsidePriceRange).mockResolvedValue(3);

      await expect(
        settingService.updateSettings({ minRegularPrice: 2_000_000 }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.SETTINGS_INVALID,
        details: { offenders: { cabinsOutsidePriceRange: 3 } },
      });
      expect(settingRepository.updateSettings).not.toHaveBeenCalled();
    });

    it("does not query cabins when no price-bound field changes", async () => {
      await settingService.updateSettings({ maxGuests: 12 });
      expect(cabinRepository.countCabinsOutsidePriceRange).not.toHaveBeenCalled();
    });
  });
});

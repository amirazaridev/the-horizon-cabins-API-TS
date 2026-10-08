import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createCabin } from "../../helpers/factories.js";
import { prisma } from "../../../src/config/database.js";
import * as settingService from "../../../src/services/setting.service.js";
import * as priceCalendarService from "../../../src/services/price-calendar.service.js";
import { currentSettings, resetSettingsCache } from "../../../src/cache/setting.store.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/setting.constants.js";
import { HTTP_STATUS } from "../../../src/constants/httpStatus.js";

// بازسازی تقویم mock می‌شود تا بتوان شکست آن را شبیه‌سازی کرد؛ بقیه‌ی سرویس واقعی است.
vi.mock("../../../src/services/price-calendar.service.js");

const ctx = useIntegrationDb();
void ctx;

describe.skipIf(!isIntegrationDbAvailable())("setting.service (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(priceCalendarService.rebuildAllCabinPriceCalendars).mockReset();
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  it("bootstraps the singleton row on the first read", async () => {
    const settings = await settingService.getSettings();

    expect(settings.maxBookingLength).toBe(DEFAULT_SETTINGS.maxBookingLength);
    expect(await prisma.setting.count()).toBe(1);
  });

  it("writes only the changed fields, keeping the rest of the DB row", async () => {
    await settingService.updateSettings({ maxGuests: 8 });
    await settingService.updateSettings({ maxBookingLength: 20 });

    const row = await prisma.setting.findFirst();
    expect(row).toMatchObject({ maxGuests: 8, maxBookingLength: 20 });
  });

  it("keeps other DB columns even when the in-memory cache is stale", async () => {
    await settingService.updateSettings({ maxGuests: 8 });

    // شبیه‌سازی کش کهنه (نمونه‌ی دیگر سرور / ریست‌شده): نباید مقدار DB را بازنویسی کند.
    resetSettingsCache();

    await settingService.updateSettings({ maxBookingLength: 20 });

    const row = await prisma.setting.findFirst();
    expect(row).toMatchObject({ maxGuests: 8, maxBookingLength: 20 });
  });

  it("refreshes the cache after a successful update", async () => {
    await settingService.updateSettings({ maxGuests: 8 });
    expect(currentSettings().maxGuests).toBe(8);
  });

  it("is a no-op (no write, no updatedAt change, no rebuild) when nothing changes", async () => {
    await settingService.updateSettings({ maxGuests: 8 });
    const before = await prisma.setting.findFirst();

    const result = await settingService.updateSettings({ maxGuests: 8 });

    const after = await prisma.setting.findFirst();
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    expect(result.calendarRowsRebuilt).toBeUndefined();
    expect(priceCalendarService.rebuildAllCabinPriceCalendars).not.toHaveBeenCalled();
  });

  it("preserves changes from two concurrent PATCHes touching different fields", async () => {
    await settingService.getSettings(); // bootstrap the row first

    const results = await Promise.allSettled([
      settingService.updateSettings({ maxGuests: 7 }),
      settingService.updateSettings({ maxBookingLength: 21 }),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ statusCode: HTTP_STATUS.CONFLICT });
      }
    }

    const row = await prisma.setting.findFirst();
    expect(row).toMatchObject({ maxGuests: 7, maxBookingLength: 21 });
  });

  it("rejects a change that would invalidate existing cabins, with a count", async () => {
    await createCabin({ regularPrice: 1_000_000 });

    await expect(
      settingService.updateSettings({ minRegularPrice: 2_000_000 }),
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.CONFLICT,
      details: { offenders: { cabinsOutsidePriceRange: 1 } },
    });

    // گارد داخل تراکنش throw می‌کند → هیچ نوشتنی commit نمی‌شود.
    expect(await prisma.setting.count()).toBe(0);
  });

  it("keeps the settings saved and reports failure when the rebuild throws", async () => {
    vi.mocked(priceCalendarService.rebuildAllCabinPriceCalendars).mockRejectedValue(
      new Error("boom"),
    );

    const result = await settingService.updateSettings({ maxTotalDiscountPercent: 40 });

    expect(result.calendarRebuild).toEqual({ status: "failed" });
    expect(result.calendarRowsRebuilt).toBeUndefined();

    const row = await prisma.setting.findFirst();
    expect(row!.maxTotalDiscountPercent).toBe(40);
  });

  it("rebuilds once for a pricing-affecting change", async () => {
    vi.mocked(priceCalendarService.rebuildAllCabinPriceCalendars).mockResolvedValue(0);

    const result = await settingService.updateSettings({ maxTotalDiscountPercent: 40 });

    expect(priceCalendarService.rebuildAllCabinPriceCalendars).toHaveBeenCalledTimes(1);
    expect(result.calendarRowsRebuilt).toBe(0);
  });
});

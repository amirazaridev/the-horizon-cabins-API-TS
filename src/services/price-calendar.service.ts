import { currentSettings, getPricingLimits } from "../cache/setting.store.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { AppError } from "../utils/AppError.js";
import { addDaysUtc, nightsBetween, todayInTimezone } from "../utils/date.util.js";
import { priceNight } from "../utils/pricing.engine.js";
import * as calendarRepository from "../repositories/price-calendar.repository.js";
import * as priceRuleRepository from "../repositories/price-rule.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import { prisma, PrismaTransactionClient } from "../config/database.js";
import logger from "../config/logger.js";
import type { Cabin } from "../generated/prisma/client.js";
import type { PricingRule } from "../types/pricing.types.js";

export interface DateRange {
  from: Date;
  to: Date;
}

//* پنجره‌ی تقویم قیمت: از امروز (به وقت تهران) تا آخرین روز افق.
export function getCalendarWindow(now: Date = new Date()): DateRange {
  const today = todayInTimezone(TIMEZONE, now);
  return {
    from: today,
    to: addDaysUtc(today, currentSettings().priceCalendarHorizonDays - 1),
  };
}

//* اشتراک دو بازه (شامل هر دو سر)؛ اگر تلاقی نداشته باشند null.
function intersect(a: DateRange, b: DateRange): DateRange | null {
  const from = new Date(Math.max(a.from.getTime(), b.from.getTime()));
  const to = new Date(Math.min(a.to.getTime(), b.to.getTime()));
  return to.getTime() >= from.getTime() ? { from, to } : null;
}

/*
 * بازه‌ای از پنجره که با تغییر یک قاعده باید بازمحاسبه شود
 * (از روی قاعده‌ی قبلی و جدید). اگر چیزی متأثر نشود null.
 */
export function resolveAffectedCalendarRange(
  before: PricingRule | null,
  after: PricingRule | null,
  window: DateRange,
): DateRange | null {
  const spans: DateRange[] = [];

  for (const rule of [before, after]) {
    if (!rule) continue;
    if (rule.kind === "weekday") return window;

    const from =
      rule.startDate && rule.startDate.getTime() > window.from.getTime()
        ? rule.startDate
        : window.from;
    const to =
      rule.endDate && rule.endDate.getTime() < window.to.getTime() ? rule.endDate : window.to;
    if (to.getTime() >= from.getTime()) spans.push({ from, to });
  }

  if (spans.length === 0) return null;

  return {
    from: new Date(Math.min(...spans.map((span) => span.from.getTime()))),
    to: new Date(Math.max(...spans.map((span) => span.to.getTime()))),
  };
}

interface RebuildInputs {
  cabin?: Cabin;
  rules?: PricingRule[];
}

/**
 * ردیف‌های تقویم یک کابین را برای بازه‌ی مشخص با موتور می‌سازد (بدون نوشتن).
 * یک بار به‌ازای هر کابین لاگ می‌کند (نه هر شب).
 */
async function buildCalendarRows(
  cabin: Cabin,
  cabinId: number,
  rules: PricingRule[],
  range: DateRange,
): Promise<calendarRepository.CabinDailyPriceRow[]> {
  const limits = getPricingLimits();
  const numDays = nightsBetween(range.from, range.to) + 1;
  const rows: calendarRepository.CabinDailyPriceRow[] = [];
  let anyExceeded = false;

  for (let i = 0; i < numDays; i += 1) {
    const date = addDaysUtc(range.from, i);
    const breakdown = priceNight(cabin.regularPrice, rules, date, limits);
    if (breakdown.limitsExceeded) anyExceeded = true;

    rows.push({
      cabinId,
      date,
      basePrice: breakdown.basePrice,
      discountPercent: breakdown.discountPercent,
      surchargePercent: breakdown.surchargePercent,
      finalPrice: breakdown.finalPrice,
    });
  }

  if (anyExceeded) {
    logger.error("Pricing limits exceeded by stored rules while rebuilding calendar", { cabinId });
  }

  return rows;
}

/*
 * بازسازی تقویم یک کابین داخل **تراکنشِ فراخوان**.
 *
 * ⚠️ فقط `db` از نوع تراکنش پذیرفته می‌شود: delete و insert باید اتمیک باشند،
 * وگرنه خواننده‌ی هم‌زمان می‌تواند ردیف‌های ناقص ببیند یا درج دوم با P2002
 * (تضاد PK روی cabinId,date) بشکند.
 *
 * اول `lockCabinForUpdate` گرفته می‌شود تا rebuildهای هم‌زمانِ یک کابین سریال شوند.
 */
export async function rebuildCabinPriceCalendar(
  db: PrismaTransactionClient,
  cabinId: number,
  range?: DateRange,
  now: Date = new Date(),
  preloaded: RebuildInputs = {},
): Promise<number> {
  const window = getCalendarWindow(now);
  const effective = intersect(range ?? window, window);
  if (!effective) return 0;

  //* قفل ردیف کابین: rebuildهای رقیب سریال می‌شوند.
  const locked = await priceRuleRepository.lockCabinForUpdate(cabinId, db);
  if (!locked) return 0;

  const cabin = preloaded.cabin ?? (await cabinRepository.findCabinById(cabinId, db));
  if (!cabin) return 0;

  const rules =
    preloaded.rules ?? (await priceRuleRepository.findActiveRulesForCabin(cabinId, db));

  const rows = await buildCalendarRows(cabin, cabinId, rules, effective);

  await calendarRepository.deleteCabinDailyPricesInRange(cabinId, effective.from, effective.to, db);
  return calendarRepository.insertCabinDailyPrices(rows, db);
}

/*
 * نسخه‌ی مستقلِ rebuild: خودش یک تراکنش می‌سازد. هر فراخوانی که قبلاً `prisma`
 * را مستقیم می‌داد باید از این استفاده کند.
 */
export async function rebuildCabinPriceCalendarStandalone(
  cabinId: number,
  range?: DateRange,
  now: Date = new Date(),
  preloaded: RebuildInputs = {},
): Promise<number> {
  return prisma.$transaction((tx) =>
    rebuildCabinPriceCalendar(tx, cabinId, range, now, preloaded),
  );
}

//* بازسازی تقویم همه‌ی کابین‌ها (کل پنجره). برای rebuild دستی و seed.
export async function rebuildAllCabinPriceCalendars(
  now: Date = new Date(),
): Promise<number> {
  const cabins = await prisma.cabin.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let total = 0;
  for (const cabin of cabins) {
    total += await rebuildCabinPriceCalendarStandalone(cabin.id, undefined, now);
  }
  return total;
}

interface MaintenanceResult {
  deleted: number;
  rebuiltCabins: number;
  failedCabins: number;
}

/*
 * نگه‌داری روزانه: ردیف‌های گذشته حذف، و ردیف‌های ناقص پنجره برای هر کابین پر می‌شوند.
 * اجرای دوباره تغییری ایجاد نمی‌کند.
 *
 * ⚠️ قفل advisory در `price-calendar.job.ts` گرفته می‌شود (وقتی از جاب صدا زده
 * شود)؛ این تابع خودش قفل نمی‌گیرد تا داخل تراکنش قفل‌دار قابل استفاده بماند.
 */
export async function runDailyPriceCalendarMaintenance(
  now: Date = new Date(),
  db: typeof prisma | PrismaTransactionClient = prisma,
): Promise<MaintenanceResult> {
  const window = getCalendarWindow(now);

  const deleted = await calendarRepository.deleteCabinDailyPricesBefore(window.from, db);

  const incomplete = await calendarRepository.findCabinIdsWithIncompleteCalendar(
    window.from,
    window.to,
    db,
  );

  let rebuiltCabins = 0;
  let failedCabins = 0;

  for (const entry of incomplete) {
    //* فاصله‌ی فقط-انتهایی/ابتدایی → فقط همان قسمت را می‌سازیم، نه کل پنجره.
    //* در صورت hole یا خالی‌بودن، کل پنجره بازسازی می‌شود.
    const rebuildRange = resolveMaintenanceRange(entry, window);
    try {
      await rebuildCabinPriceCalendar(db, entry.cabinId, rebuildRange, now);
      rebuiltCabins += 1;
    } catch (error) {
      failedCabins += 1;
      logger.error("Price calendar rebuild failed for cabin", { cabinId: entry.cabinId, error });
    }
  }

  if (deleted > 0 || rebuiltCabins > 0 || failedCabins > 0) {
    logger.info("Price calendar maintenance completed", { deleted, rebuiltCabins, failedCabins });
  }

  return { deleted, rebuiltCabins, failedCabins };
}

/**
 * بازه‌ی بازسازی برای یک کابینِ ناقص:
 * - بدون ردیف یا با hole → کل پنجره (باید کامل بازسازی شود).
 * - فقط فاصله‌ی انتهایی (count === max - from + 1) → از روز بعدِ max تا انتهای پنجره.
 */
function resolveMaintenanceRange(
  entry: calendarRepository.IncompleteCabin,
  window: DateRange,
): DateRange {
  const trailingGapOnly =
    entry.maxDate !== null && entry.count === nightsBetween(window.from, entry.maxDate) + 1;

  if (trailingGapOnly) {
    const next = addDaysUtc(entry.maxDate!, 1);
    if (next.getTime() <= window.to.getTime()) return { from: next, to: window.to };
  }

  return window;
}

//? ==================================================================
//? Read / manual rebuild
//? ==================================================================

export interface PriceCalendarDay {
  date: Date;
  basePrice: number;
  discountPercent: number;
  surchargePercent: number;
  finalPrice: number;
}

export interface PriceCalendarResult {
  cabinId: number;
  from: Date;
  to: Date;
  days: PriceCalendarDay[];
}

/*
 * خواندن تقویم قیمت یک کابین از `CabinDailyPrice`.
 * بازه باید داخل پنجره باشد. اگر ردیف‌ها ناقص باشند، **هیچ چیزی نوشته نمی‌شود**؛
 * روزهای غایب در حافظه با همان موتور محاسبه و برگردانده می‌شوند تا پاسخ کامل
 * بماند اما GET باعث نوشتنِ هم‌زمانِ تقویم (و تضاد) نشود. نوشتن با cron یا
 * rebuild دستی انجام می‌شود.
 */
export async function getCabinPriceCalendar(
  cabinId: number,
  range: { from?: Date; to?: Date } = {},
  now: Date = new Date(),
): Promise<PriceCalendarResult> {
  const window = getCalendarWindow(now);

  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  const from = range.from ?? window.from;
  const to = range.to ?? window.to;

  if (
    from.getTime() < window.from.getTime() ||
    to.getTime() > window.to.getTime() ||
    to.getTime() < from.getTime()
  ) {
    throw new AppError(
      "Requested range is outside the price calendar window",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.PRICE_CALENDAR_RANGE_INVALID,
    );
  }

  const rows = await calendarRepository.findCabinDailyPrices(cabinId, from, to);
  const expectedDays = nightsBetween(from, to) + 1;

  //* ردیف‌های ذخیره‌شده را بر اساس تاریخ ایندکس می‌کنیم.
  const byDate = new Map(rows.map((row) => [row.date.getTime(), row]));

  const storedMissing = byDate.size < expectedDays;
  let computedMissing: Map<number, calendarRepository.CabinDailyPriceRow> | null = null;

  if (storedMissing) {
    logger.warn("Price calendar rows missing; filling response in memory", {
      cabinId,
      expectedDays,
      found: byDate.size,
    });

    const rules = await priceRuleRepository.findActiveRulesForCabin(cabinId);
    const limits = getPricingLimits();
    computedMissing = new Map();

    for (let i = 0; i < expectedDays; i += 1) {
      const date = addDaysUtc(from, i);
      if (byDate.has(date.getTime())) continue;
      const breakdown = priceNight(cabin.regularPrice, rules, date, limits);
      computedMissing.set(date.getTime(), {
        cabinId,
        date,
        basePrice: breakdown.basePrice,
        discountPercent: breakdown.discountPercent,
        surchargePercent: breakdown.surchargePercent,
        finalPrice: breakdown.finalPrice,
      });
    }
  }

  const days: PriceCalendarDay[] = [];
  for (let i = 0; i < expectedDays; i += 1) {
    const key = addDaysUtc(from, i).getTime();
    const row = byDate.get(key) ?? computedMissing?.get(key);
    if (!row) continue;
    days.push({
      date: row.date,
      basePrice: row.basePrice,
      discountPercent: row.discountPercent,
      surchargePercent: row.surchargePercent,
      finalPrice: row.finalPrice,
    });
  }

  return { cabinId, from, to, days };
}

//* rebuild دستی (owner): یک کابین مشخص یا همه‌ی کابین‌ها.
export async function rebuildCalendar(
  cabinId?: number,
  now: Date = new Date(),
): Promise<{ cabinsRebuilt: number; rowsWritten: number }> {
  if (cabinId !== undefined) {
    const cabin = await cabinRepository.findCabinById(cabinId);
    if (!cabin) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

    const rowsWritten = await rebuildCabinPriceCalendarStandalone(cabinId, undefined, now);
    return { cabinsRebuilt: 1, rowsWritten };
  }

  const cabins = await prisma.cabin.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let rowsWritten = 0;
  for (const cabin of cabins) {
    rowsWritten += await rebuildCabinPriceCalendarStandalone(cabin.id, undefined, now);
  }
  return { cabinsRebuilt: cabins.length, rowsWritten };
}

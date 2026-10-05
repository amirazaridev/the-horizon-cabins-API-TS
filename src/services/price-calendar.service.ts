import { getPricingLimits, PRICING_LIMITS } from "../constants/pricing.constants.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { AppError } from "../utils/AppError.js";
import { addDaysUtc, nightsBetween, todayInTimezone } from "../utils/date.util.js";
import {
  applyDefensiveLimits,
  calculateNightPrice,
  rulesForNight,
} from "../utils/pricing.engine.js";
import * as calendarRepository from "../repositories/price-calendar.repository.js";
import * as priceRuleRepository from "../repositories/price-rule.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import { prisma, PrismaTransactionClient } from "../config/database.js";
import logger from "../config/logger.js";
import type { PricingRule } from "../types/pricing.types.js";

type Db = typeof prisma | PrismaTransactionClient;

export interface DateRange {
  from: Date;
  to: Date;
}

//* پنجره‌ی تقویم قیمت: از امروز (به وقت تهران) تا آخرین روز افق.
export function getCalendarWindow(now: Date = new Date()): DateRange {
  const today = todayInTimezone(TIMEZONE, now);
  return {
    from: today,
    to: addDaysUtc(today, PRICING_LIMITS.priceCalendarHorizonDays - 1),
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

/*
 * بازسازی تقویم یک کابین برای بازه‌ی مشخص (پیش‌فرض: کل پنجره).
 * ردیف‌های قدیمی حذف و با موتور قیمت‌گذاری دوباره ساخته می‌شوند.
 */
export async function rebuildCabinPriceCalendar(
  db: Db,
  cabinId: number,
  range?: DateRange,
  now: Date = new Date(),
): Promise<number> {
  const window = getCalendarWindow(now);
  const effective = intersect(range ?? window, window);
  if (!effective) return 0;

  const cabin = await cabinRepository.findCabinById(cabinId, db);
  if (!cabin) return 0;

  const rules = await priceRuleRepository.findActiveRulesForCabin(cabinId, db);
  const limits = await getPricingLimits();

  const numDays = nightsBetween(effective.from, effective.to) + 1;
  const rows: calendarRepository.CabinDailyPriceRow[] = [];

  for (let i = 0; i < numDays; i += 1) {
    const date = addDaysUtc(effective.from, i);
    const covering = rulesForNight(rules as PricingRule[], date);
    const clamped = applyDefensiveLimits(covering, limits);
    const breakdown = calculateNightPrice(cabin.regularPrice, clamped.rules, clamped.exceeded);

    rows.push({
      cabinId,
      date,
      basePrice: breakdown.basePrice,
      discountPercent: breakdown.discountPercent,
      surchargePercent: breakdown.surchargePercent,
      finalPrice: breakdown.finalPrice,
    });
  }

  await calendarRepository.deleteCabinDailyPricesInRange(
    cabinId,
    effective.from,
    effective.to,
    db,
  );
  return calendarRepository.insertCabinDailyPrices(rows, db);
}

//* بازسازی تقویم همه‌ی کابین‌ها (کل پنجره). برای rebuild دستی و seed. 
export async function rebuildAllCabinPriceCalendars(
  now: Date = new Date(),
  db: Db = prisma,
): Promise<number> {
  const cabins = await db.cabin.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let total = 0;
  for (const cabin of cabins) {
    total += await rebuildCabinPriceCalendar(db, cabin.id, undefined, now);
  }
  return total;
}

/*
 * نگه‌داری روزانه: ردیف‌های گذشته حذف، و ردیف‌های ناقص پنجره برای هر کابین پر می‌شوند.
 * اجرای دوباره تغییری ایجاد نمی‌کند.
 */
export async function runDailyPriceCalendarMaintenance(
  now: Date = new Date(),
  db: Db = prisma,
): Promise<{ deleted: number; rebuiltCabins: number }> {
  const window = getCalendarWindow(now);
  const expectedDays = PRICING_LIMITS.priceCalendarHorizonDays;

  const deleted = await calendarRepository.deleteCabinDailyPricesBefore(window.from, db);

  const incomplete = await calendarRepository.findCabinIdsWithIncompleteCalendar(
    window.from,
    window.to,
    expectedDays,
    db,
  );

  for (const cabinId of incomplete) {
    await rebuildCabinPriceCalendar(db, cabinId, window, now);
  }

  if (deleted > 0 || incomplete.length > 0) {
    logger.info("Price calendar maintenance completed", {
      deleted,
      rebuiltCabins: incomplete.length,
    });
  }

  return { deleted, rebuiltCabins: incomplete.length };
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
 * بازه باید داخل پنجره باشد. اگر ردیف‌ها ناقص باشند (مثلاً قبل از اجرای جاب)،
 * همان بازه بازسازی می‌شود تا پاسخ همیشه کامل باشد (self-healing).
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

  let rows = await calendarRepository.findCabinDailyPrices(cabinId, from, to);
  const expectedDays = nightsBetween(from, to) + 1;

  if (rows.length < expectedDays) {
    logger.warn("Price calendar rows missing; rebuilding on demand", {
      cabinId,
      expectedDays,
      found: rows.length,
    });
    await rebuildCabinPriceCalendar(prisma, cabinId, { from, to }, now);
    rows = await calendarRepository.findCabinDailyPrices(cabinId, from, to);
  }

  return {
    cabinId,
    from,
    to,
    days: rows.map((row) => ({
      date: row.date,
      basePrice: row.basePrice,
      discountPercent: row.discountPercent,
      surchargePercent: row.surchargePercent,
      finalPrice: row.finalPrice,
    })),
  };
}

//* rebuild دستی (owner): یک کابین مشخص یا همه‌ی کابین‌ها. */
export async function rebuildCalendar(
  cabinId?: number,
  now: Date = new Date(),
): Promise<{ cabinsRebuilt: number; rowsWritten: number }> {
  if (cabinId !== undefined) {
    const cabin = await cabinRepository.findCabinById(cabinId);
    if (!cabin) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

    const rowsWritten = await rebuildCabinPriceCalendar(prisma, cabinId, undefined, now);
    return { cabinsRebuilt: 1, rowsWritten };
  }

  const cabins = await prisma.cabin.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let rowsWritten = 0;
  for (const cabin of cabins) {
    rowsWritten += await rebuildCabinPriceCalendar(prisma, cabin.id, undefined, now);
  }
  return { cabinsRebuilt: cabins.length, rowsWritten };
}

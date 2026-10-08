import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { prisma, type PrismaTransactionClient } from "../config/database.js";
import logger from "../config/logger.js";
import * as settingRepository from "../repositories/setting.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import * as priceRuleRepository from "../repositories/price-rule.repository.js";
import * as bookingRepository from "../repositories/booking.repository.js";
import { applySettingsRow, refreshSettings } from "./setting.store.js";
import {
  INT4_MAX,
  PRICING_AFFECTING_SETTINGS,
  SETTINGS_FIELDS,
} from "../constants/settings.constants.js";
import { rebuildAllCabinPriceCalendars } from "./price-calendar.service.js";
import { withSerializableRetry } from "../utils/transaction.util.js";
import { deriveMaxRegularPrice } from "../utils/price-limits.util.js";
import { pickSettingsColumns } from "../utils/settings.util.js";
import { todayInTimezone } from "../utils/date.util.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import type { AppSettings, SettingsColumns, UpdateSettingsInput } from "../types/setting.types.js";

export interface SettingsUpdateResult {
  settings: Readonly<AppSettings>;
  /** تعداد ردیف‌های تقویم که در پی تغییر فیلدهای اثرگذار بازنویسی شدند. */
  calendarRowsRebuilt?: number;
  /** وقتی تنظیمات ذخیره شده ولی بازسازی تقویم شکست خورده باشد. */
  calendarRebuild?: { status: "failed" };
}

/** خواندن تنظیمات مؤثر — همیشه از DB تازه می‌شود (کش با گارد updatedAt به‌روز می‌شود). */
export async function getSettings(): Promise<Readonly<AppSettings>> {
  return refreshSettings();
}

function invalid(message: string, details?: unknown): AppError {
  return new AppError(message, HTTP_STATUS.BAD_REQUEST, ErrorCode.SETTINGS_INVALID, true, details);
}

/**
 * سازگاری بین‌فیلدی روی ردیفِ **merge‌شده** (نه فقط فیلدهای ارسالی).
 * توابع pure و بدون I/O؛ در تست‌های unit مستقیم قابل فراخوانی است.
 */
export function assertConsistent(settings: SettingsColumns): void {
  if (settings.maxBookingLength < settings.minBookingLength) {
    throw invalid("maxBookingLength must be greater than or equal to minBookingLength");
  }

  if (settings.startingPriceWindowDays > settings.maxAdvanceBookingDays) {
    throw invalid("startingPriceWindowDays cannot exceed maxAdvanceBookingDays");
  }

  if (settings.maxRegularPrice < settings.minRegularPrice) {
    throw invalid("maxRegularPrice must be greater than or equal to minRegularPrice");
  }

  if (settings.maxNightlyPrice < settings.minRegularPrice) {
    throw invalid("maxNightlyPrice must be greater than or equal to minRegularPrice");
  }

  const derivedMaxRegularPrice = deriveMaxRegularPrice(
    settings.maxNightlyPrice,
    settings.maxTotalSurchargePercent,
  );
  if (settings.maxRegularPrice > derivedMaxRegularPrice) {
    throw invalid(
      `maxRegularPrice (${settings.maxRegularPrice}) exceeds the allowed maximum ` +
        `${derivedMaxRegularPrice} derived from maxNightlyPrice (${settings.maxNightlyPrice}) ` +
        `and maxTotalSurchargePercent (${settings.maxTotalSurchargePercent}); lower it in the same request`,
    );
  }

  //* بزرگ‌ترین مقدار ذخیره‌شده = Booking.totalPrice (جمع قیمت شب‌ها). ستون int4 است.
  if (settings.maxBookingLength * settings.maxNightlyPrice > INT4_MAX) {
    throw invalid(
      `maxBookingLength (${settings.maxBookingLength}) × maxNightlyPrice ` +
        `(${settings.maxNightlyPrice}) exceeds the maximum integer ${INT4_MAX} supported for booking totals`,
    );
  }
}

/** فیلدهایی که ورودی واقعاً تغییرشان می‌دهد (نه فقط حضور در بدنه). */
function computeChanges(
  input: UpdateSettingsInput,
  current: SettingsColumns,
): Partial<SettingsColumns> {
  const changes: Partial<SettingsColumns> = {};
  for (const field of SETTINGS_FIELDS) {
    const next = input[field];
    if (next !== undefined && next !== current[field]) {
      changes[field] = next;
    }
  }
  return changes;
}

interface OffenderCounts {
  cabinsOutsidePriceRange?: number;
  discountRulesAboveCap?: number;
  surchargeRulesAboveCap?: number;
  upcomingBookingsAboveMaxGuests?: number;
}

/**
 * گارد داده‌ی موجود: اگر سقف‌های جدید، داده‌ی فعلی را نامعتبر کنند، تعداد
 * ردیف‌های متخلف را برمی‌گرداند. فقط فیلدهای تغییرکرده بررسی می‌شوند.
 */
async function collectExistingDataOffenders(
  changes: Partial<SettingsColumns>,
  merged: SettingsColumns,
  tx: PrismaTransactionClient,
): Promise<OffenderCounts> {
  const offenders: OffenderCounts = {};

  if (changes.minRegularPrice !== undefined || changes.maxRegularPrice !== undefined) {
    const count = await cabinRepository.countCabinsOutsidePriceRange(
      merged.minRegularPrice,
      merged.maxRegularPrice,
      tx,
    );
    if (count > 0) offenders.cabinsOutsidePriceRange = count;
  }

  if (changes.maxTotalDiscountPercent !== undefined) {
    const count = await priceRuleRepository.countActiveRulesAbovePercent(
      "discount",
      merged.maxTotalDiscountPercent,
      tx,
    );
    if (count > 0) offenders.discountRulesAboveCap = count;
  }

  if (changes.maxTotalSurchargePercent !== undefined) {
    const count = await priceRuleRepository.countActiveRulesAbovePercent(
      "surcharge",
      merged.maxTotalSurchargePercent,
      tx,
    );
    if (count > 0) offenders.surchargeRulesAboveCap = count;
  }

  if (changes.maxGuests !== undefined) {
    const count = await bookingRepository.countUpcomingBookingsAboveGuests(
      merged.maxGuests,
      todayInTimezone(TIMEZONE),
      tx,
    );
    if (count > 0) offenders.upcomingBookingsAboveMaxGuests = count;
  }

  return offenders;
}

//* بازسازی‌های تقویم سریال می‌شوند: هیچ‌گاه دو بازسازی هم‌زمان اجرا نمی‌شود و
//* هر اجرا آخرین تنظیمات را می‌خواند.
let rebuildChain: Promise<unknown> = Promise.resolve();

function scheduleCalendarRebuild(): Promise<number> {
  const run = rebuildChain.then(() => rebuildAllCabinPriceCalendars());
  rebuildChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * به‌روزرسانی تنظیمات توسط admin/owner.
 *
 * - خواندن → merge → اعتبارسنجی → نوشتن همه داخل **یک تراکنش Serializable** با
 *   retry برای P2034 انجام می‌شود؛ ردیف از DB خوانده می‌شود نه از کش.
 * - فقط فیلدهای تغییرکرده نوشته می‌شوند (partial update).
 * - اگر هیچ فیلدی تغییر نکند: بدون نوشتن/کش/rebuild، وضعیت فعلی برگردانده می‌شود.
 * - کش فقط **بعد از commit** به‌روز می‌شود.
 */
export async function updateSettings(input: UpdateSettingsInput): Promise<SettingsUpdateResult> {
  const outcome = await withSerializableRetry(
    () =>
      prisma.$transaction(
        async (tx) => {
          const row = await settingRepository.ensureSettings(tx);
          const current = pickSettingsColumns(row);
          const changes = computeChanges(input, current);

          if (Object.keys(changes).length === 0) {
            return { saved: row, changes, changed: false };
          }

          const merged: SettingsColumns = { ...current, ...changes };
          assertConsistent(merged);

          const offenders = await collectExistingDataOffenders(changes, merged, tx);
          if (Object.keys(offenders).length > 0) {
            throw new AppError(
              "The new settings would invalidate existing data",
              HTTP_STATUS.CONFLICT,
              ErrorCode.SETTINGS_INVALID,
              true,
              { offenders },
            );
          }

          const saved = await settingRepository.updateSettings(changes, tx);
          return { saved, changes, changed: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    3,
  );

  //* کش فقط بعد از commit و با گارد updatedAt به‌روز می‌شود.
  const settings = applySettingsRow(outcome.saved);
  if (!outcome.changed) return { settings };

  const pricingAffectingChanged = PRICING_AFFECTING_SETTINGS.some(
    (field) => field in outcome.changes,
  );
  if (!pricingAffectingChanged) return { settings };

  try {
    const calendarRowsRebuilt = await scheduleCalendarRebuild();
    return { settings, calendarRowsRebuilt };
  } catch (error) {
    logger.error("Settings saved but price calendar rebuild failed", {
      error,
      changedFields: Object.keys(outcome.changes),
    });
    return { settings, calendarRebuild: { status: "failed" } };
  }
}

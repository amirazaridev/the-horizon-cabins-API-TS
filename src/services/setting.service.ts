import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import * as settingRepository from "../repositories/setting.repository.js";
import { applySettingsRow, currentSettings, refreshSettings } from "./setting.store.js";
import { PRICING_AFFECTING_SETTINGS, SETTINGS_FIELDS } from "../constants/settings.constants.js";
import { rebuildAllCabinPriceCalendars } from "./price-calendar.service.js";
import type { AppSettings, SettingsColumns, UpdateSettingsInput } from "../types/setting.types.js";

export interface SettingsUpdateResult {
  settings: AppSettings;
  /** تعداد ردیف‌های تقویم قیمت که در پی تغییر فیلدهای اثرگذار بازنویسی شدند. */
  calendarRowsRebuilt?: number;
}

/** خواندن تنظیمات مؤثر (get-or-create در DB) — برای endpoint خواندن. */
export async function getSettings(): Promise<AppSettings> {
  return refreshSettings();
}

/** کپی فقط ستون‌های قابل‌تنظیم از یک شیء (بدون مقادیر مشتق‌شده). */
function pickColumns(source: SettingsColumns): SettingsColumns {
  const columns = {} as SettingsColumns;
  for (const field of SETTINGS_FIELDS) {
    columns[field] = source[field];
  }
  return columns;
}

function invalid(message: string): AppError {
  return new AppError(message, HTTP_STATUS.BAD_REQUEST, ErrorCode.SETTINGS_INVALID);
}

/**
 * اعتبارسنجی سازگاری بین‌فیلدی روی ردیفِ merge‌شده.
 * این قواعد به مقدار نهایی (بعد از اعمال PATCH) نگاه می‌کنند، نه صرفاً به
 * فیلدهای ارسالی؛ چون PATCH جزئی است.
 */
function assertConsistent(settings: SettingsColumns): void {
  if (settings.maxBookingLength < settings.minBookingLength) {
    throw invalid("maxBookingLength must be greater than or equal to minBookingLength");
  }

  if (settings.maxRegularPrice < settings.minRegularPrice) {
    throw invalid("maxRegularPrice must be greater than or equal to minRegularPrice");
  }

  if (settings.maxNightlyPrice < settings.minRegularPrice) {
    throw invalid("maxNightlyPrice must be greater than or equal to minRegularPrice");
  }

  //* همان invariant مشتق‌شده در pricing.constants: بیشترین افزایش قیمت هم نباید
  //* از سقف قیمت شب عبور کند → maxRegularPrice = floor(maxNightlyPrice / (1 + S%)).
  const derivedMaxRegularPrice = Math.floor(
    settings.maxNightlyPrice / (1 + settings.maxTotalSurchargePercent / 100),
  );
  if (settings.maxRegularPrice > derivedMaxRegularPrice) {
    throw invalid(
      `maxRegularPrice cannot exceed ${derivedMaxRegularPrice} given maxNightlyPrice and maxTotalSurchargePercent`,
    );
  }
}

/**
 * به‌روزرسانی تنظیمات توسط admin/owner.
 *
 * - ورودی جزئی است؛ روی تنظیمات فعلی merge می‌شود.
 * - سازگاری بین‌فیلدی قبل از نوشتن بررسی می‌شود.
 * - پس از نوشتن، کش به‌روز و در صورت تغییر فیلدهای اثرگذارِ قیمت‌گذاری، تقویم
 *   قیمت همه‌ی کابین‌ها بازسازی می‌شود.
 */
export async function updateSettings(input: UpdateSettingsInput): Promise<SettingsUpdateResult> {
  const current = currentSettings();
  const merged: SettingsColumns = { ...pickColumns(current), ...input };

  assertConsistent(merged);

  const saved = await settingRepository.saveSettings(merged);
  const settings = applySettingsRow(saved);

  const pricingAffectingChanged = PRICING_AFFECTING_SETTINGS.some(
    (field) => merged[field] !== current[field],
  );

  const calendarRowsRebuilt = pricingAffectingChanged
    ? await rebuildAllCabinPriceCalendars()
    : undefined;

  return { settings, calendarRowsRebuilt };
}

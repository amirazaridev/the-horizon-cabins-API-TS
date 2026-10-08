import * as settingRepository from "../repositories/setting.repository.js";
import { DEFAULT_SETTINGS, SETTINGS_FIELDS } from "../constants/settings.constants.js";
import type { AppSettings, SettingsColumns } from "../types/setting.types.js";
import type { PricingLimits } from "../types/pricing.types.js";
import type { Setting } from "../generated/prisma/client.js";

/**
 * کش در حافظه‌ی تنظیمات + تصویربرداری به سقف‌های دامنه.
 *
 * چرا کش؟ مسیرهای داغ (رزرو، quote، تقویم قیمت) در هر درخواست چند بار به
 * سقف‌ها نیاز دارند و خواندن DB در هر بار هم پرهزینه است و هم باعث می‌شود
 * getterها async شوند (که به کل لایه‌ی validation و utils سرریز می‌کند).
 * بنابراین تنظیمات یک‌بار در استارت سرور از DB خوانده می‌شود و پس از هر
 * `PATCH` موفق به‌روز می‌شود.
 *
 * ⚠️ این ماژول به هیچ سرویس دیگری وابسته نیست تا price-calendar.service بتواند
 * بدون ایجاد حلقه‌ی import از آن استفاده کند.
 */

/** ستون‌های قابل‌تنظیم را از یک ردیف Prisma استخراج می‌کند. */
function toColumns(row: Setting): SettingsColumns {
  const columns = {} as SettingsColumns;
  for (const field of SETTINGS_FIELDS) {
    columns[field] = row[field];
  }
  return columns;
}

/** مقادیر مشتق‌شده را از ستون‌های پایه می‌سازد. */
export function deriveSettings(columns: SettingsColumns): AppSettings {
  return {
    ...columns,
    priceCalendarHorizonDays: columns.maxAdvanceBookingDays,
    bookedDatesMaxRangeDays: columns.maxAdvanceBookingDays + 1,
  };
}

/** کش فعلی — با پیش‌فرض‌ها مقداردهی اولیه می‌شود. */
let cache: AppSettings = deriveSettings(DEFAULT_SETTINGS);

/** تنظیمات مؤثر فعلی (sync، از کش). */
export function currentSettings(): AppSettings {
  return cache;
}

/** اعمال یک ردیف Prisma روی کش و برگرداندن مقدار مشتق‌شده. */
export function applySettingsRow(row: Setting): AppSettings {
  cache = deriveSettings(toColumns(row));
  return cache;
}

/** ریست کش به پیش‌فرض‌ها (برای تست‌ها / startup پیش از خواندن از DB). */
export function resetSettingsCache(): void {
  cache = deriveSettings(DEFAULT_SETTINGS);
}

/** خواندن تنظیمات از DB (get-or-create) و تازه‌سازی کش. */
export async function refreshSettings(): Promise<AppSettings> {
  const row =
    (await settingRepository.findSettings()) ??
    (await settingRepository.createSettings(DEFAULT_SETTINGS));
  return applySettingsRow(row);
}

/** نگاشت تنظیمات به سقف‌های موردنیاز موتور قیمت‌گذاری. */
export function toPricingLimits(settings: AppSettings): PricingLimits {
  return {
    maxDiscountsPerNight: settings.maxDiscountsPerNight,
    maxSurchargesPerNight: settings.maxSurchargesPerNight,
    maxTotalDiscountPercent: settings.maxTotalDiscountPercent,
    maxTotalSurchargePercent: settings.maxTotalSurchargePercent,
    maxNightlyPrice: settings.maxNightlyPrice,
    minRegularPrice: settings.minRegularPrice,
    maxRegularPrice: settings.maxRegularPrice,
    maxAdvanceBookingDays: settings.maxAdvanceBookingDays,
    priceCalendarHorizonDays: settings.priceCalendarHorizonDays,
    startingPriceWindowDays: settings.startingPriceWindowDays,
    priceRuleMaxFutureDays: settings.priceRuleMaxFutureDays,
  };
}

/** سقف‌های قیمت‌گذاری مؤثر فعلی (sync، از کش). */
export function getPricingLimits(): PricingLimits {
  return toPricingLimits(cache);
}

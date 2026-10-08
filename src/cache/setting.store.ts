import * as settingRepository from "../repositories/setting.repository.js";
import { DEFAULT_SETTINGS } from "../constants/setting.constants.js";
import { pickSettingsColumns } from "../utils/settings.util.js";
import type { AppSettings, SettingsColumns } from "../types/setting.types.js";
import type { PricingLimits } from "../types/pricing.types.js";
import type { Setting } from "../generated/prisma/client.js";


/** مقادیر مشتق‌شده را از ستون‌های پایه می‌سازد (frozen). */
export function deriveSettings(columns: SettingsColumns): Readonly<AppSettings> {
  return Object.freeze({
    ...columns,
    priceCalendarHorizonDays: columns.maxAdvanceBookingDays,
    bookedDatesMaxRangeDays: columns.maxAdvanceBookingDays + 1,
  });
}

/** نگاشت تنظیمات به سقف‌های موتور قیمت‌گذاری (frozen). */
export function toPricingLimits(settings: AppSettings): Readonly<PricingLimits> {
  return Object.freeze({
    maxDiscountsPerNight: settings.maxDiscountsPerNight,
    maxSurchargesPerNight: settings.maxSurchargesPerNight,
    maxTotalDiscountPercent: settings.maxTotalDiscountPercent,
    maxTotalSurchargePercent: settings.maxTotalSurchargePercent,
    maxNightlyPrice: settings.maxNightlyPrice,
    minRegularPrice: settings.minRegularPrice,
    maxRegularPrice: settings.maxRegularPrice,
    priceCalendarHorizonDays: settings.priceCalendarHorizonDays,
    startingPriceWindowDays: settings.startingPriceWindowDays,
    priceRuleMaxFutureDays: settings.priceRuleMaxFutureDays,
  });
}

interface CacheState {
  settings: Readonly<AppSettings>;
  /** یک‌بار محاسبه و کش می‌شود تا `getPricingLimits` شیء تازه نسازد. */
  pricingLimits: Readonly<PricingLimits>;
  /** زمان تغییر ردیف DB که در کش اعمال شده (برای گارد ضد-rollback). */
  rowUpdatedAt: Date | null;
}

function buildState(columns: SettingsColumns, rowUpdatedAt: Date | null): CacheState {
  const settings = deriveSettings(columns);
  return { settings, pricingLimits: toPricingLimits(settings), rowUpdatedAt };
}

let state: CacheState = buildState(DEFAULT_SETTINGS, null);

/** تنظیمات مؤثر فعلی (sync، از کش). */
export function currentSettings(): Readonly<AppSettings> {
  return state.settings;
}

/** سقف‌های قیمت‌گذاری مؤثر فعلی (sync، از کش). */
export function getPricingLimits(): Readonly<PricingLimits> {
  return state.pricingLimits;
}


export function applySettingsRow(row: Setting): Readonly<AppSettings> {
  if (state.rowUpdatedAt === null || row.updatedAt.getTime() >= state.rowUpdatedAt.getTime()) {
    state = buildState(pickSettingsColumns(row), row.updatedAt);
  }
  return state.settings;
}

/** ریست کش به پیش‌فرض‌ها (برای تست‌ها / startup پیش از خواندن از DB). */
export function resetSettingsCache(): void {
  state = buildState(DEFAULT_SETTINGS, null);
}

/** خواندن تنظیمات از DB (get-or-create) و اعمال گاردشده روی کش. */
export async function refreshSettings(): Promise<Readonly<AppSettings>> {
  return applySettingsRow(await settingRepository.ensureSettings());
}

import * as settingRepository from "../repositories/setting.repository.js";
import { DEFAULT_SETTINGS } from "../constants/settings.constants.js";
import { pickSettingsColumns } from "../utils/settings.util.js";
import type { AppSettings, SettingsColumns } from "../types/setting.types.js";
import type { PricingLimits } from "../types/pricing.types.js";
import type { Setting } from "../generated/prisma/client.js";

/*
 * کش در حافظه‌ی تنظیمات + نگاشت به سقف‌های دامنه.
 *
 * چرا کش؟ مسیرهای داغ (رزرو، quote، تقویم قیمت) در هر درخواست چند بار به
 * سقف‌ها نیاز دارند و خواندن DB در هر بار هم پرهزینه است و هم باعث می‌شود
 * getterها async شوند (که به کل لایه‌ی validation و utils سرریز می‌کند).
 * بنابراین تنظیمات یک‌بار در استارت سرور از DB خوانده می‌شود و پس از هر
 * `PATCH` موفق (و هر خواندنِ GET) به‌روز می‌شود.
 *
 * ⚠️ محدودیت چند-نمونه‌ای (multi-instance): این کش per-process است. اگر چند
 * نمونه‌ی سرور بالا باشد، تغییرِ یک نمونه فوراً به کش نمونه‌های دیگر نمی‌رسد.
 * راهکار در استقرار چند-نمونه‌ای: TTL کوتاه + `refreshSettings()`، یا
 * invalidation مبتنی بر pub/sub. در تک‌نمونه (وضعیت فعلی پروژه) مسئله‌ای نیست.
 *
 * ⚠️ این ماژول به هیچ سرویس دیگری وابسته نیست تا price-calendar.service بتواند
 * بدون ایجاد حلقه‌ی import از آن استفاده کند.
 */

/** مقادیر مشتق‌شده را از ستون‌های پایه می‌سازد (frozen). */
export function deriveSettings(columns: SettingsColumns): Readonly<AppSettings> {
  return Object.freeze({
    ...columns,
    priceCalendarHorizonDays: columns.maxAdvanceBookingDays,
    bookedDatesMaxRangeDays: columns.maxAdvanceBookingDays + 1,
  });
}

/** نگاشت تنظیمات به سقف‌های موتور قیمت‌گذاری (frozen). */
function derivePricingLimits(settings: AppSettings): Readonly<PricingLimits> {
  return Object.freeze({
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
  return { settings, pricingLimits: derivePricingLimits(settings), rowUpdatedAt };
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

/**
 * یک ردیف Prisma را روی کش اعمال می‌کند — **فقط اگر از کش قدیمی‌تر نباشد**.
 * این گارد جلوی rollback کش به یک اسنپ‌شات قدیمی‌تر (در رقابت GET با PATCH) را
 * می‌گیرد و همیشه جدیدترین حالت را برمی‌گرداند.
 */
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

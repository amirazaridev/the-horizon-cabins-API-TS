import type { Setting } from "../generated/prisma/client.js";

/**
 * تایپ‌های دامنه‌ی تنظیمات (جدول `Setting`).
 *
 * `SettingsColumns` مستقیماً از مدل Prisma مشتق می‌شود (بدون `id` و زمان‌ها) تا
 * هیچ نسخه‌ی دست‌نویسِ موازی‌ای نداشته باشیم؛ افزودن ستون جدید به اسکیما
 * به‌طور خودکار به این تایپ هم اضافه می‌شود.
 */
export type SettingsColumns = Omit<Setting, "id" | "createdAt" | "updatedAt">;

/** تنظیمات مؤثر در runtime: ستون‌ها + مقادیر مشتق‌شده (نه در دیتابیس). */
export interface AppSettings extends SettingsColumns {
  /** افق تقویم قیمت = افق رزرو (طبق طراحی «تقویم = رزرو»). */
  priceCalendarHorizonDays: number;
  /** حداکثر بازهٔ قابل‌پرس‌وجوی تاریخ‌های رزروشده = افق رزرو + ۱. */
  bookedDatesMaxRangeDays: number;
}

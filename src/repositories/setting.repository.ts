import { prisma } from "../config/database.js";
import type { Setting } from "../generated/prisma/client.js";
import type { SettingsColumns } from "../types/setting.types.js";

/**
 * دسترسی به ردیف **singleton** تنظیمات.
 *
 * جدول `settings` عمداً یک ردیف دارد؛ همه‌ی توابع روی کوچک‌ترین id کار می‌کنند
 * تا اگر اشتباهاً چند ردیف ساخته شد، رفتار قطعی و تکرارپذیر بماند.
 */

/** ردیف تنظیمات (کوچک‌ترین id) یا `null` اگر هنوز ساخته نشده باشد. */
export async function findSettings(): Promise<Setting | null> {
  return prisma.setting.findFirst({ orderBy: { id: "asc" } });
}

/** ساخت ردیف اولیه‌ی تنظیمات. */
export async function createSettings(data: SettingsColumns): Promise<Setting> {
  return prisma.setting.create({ data });
}

/**
 * نوشتن مقادیر تنظیمات روی ردیف موجود؛ اگر ردیفی وجود نداشته باشد، می‌سازد.
 * کل مقادیر (نه فقط فیلدهای تغییرکرده) نوشته می‌شود چون سرویس از قبل merge
 * کرده است.
 */
export async function saveSettings(data: SettingsColumns): Promise<Setting> {
  const existing = await findSettings();
  if (existing) {
    return prisma.setting.update({ where: { id: existing.id }, data });
  }
  return createSettings(data);
}

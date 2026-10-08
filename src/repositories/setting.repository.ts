import { prisma, type PrismaTransactionClient } from "../config/database.js";
import { DEFAULT_SETTINGS } from "../constants/setting.constants.js";
import type { Setting } from "../generated/prisma/client.js";
import type { SettingsColumns } from "../types/setting.types.js";

type Db = typeof prisma | PrismaTransactionClient;

/** شناسه‌ی ثابت ردیف singleton تنظیمات. */
export const SETTINGS_ID = 1;

/**
 * دسترسی به ردیف **singleton** تنظیمات.
 *
 * جدول `settings` دقیقاً یک ردیف با id ثابت دارد. برخلاف find-then-create،
 * `upsert` روی id ثابت است تا درخواست‌های همزمانِ اولیه نتوانند دو ردیف بسازند.
 */

/** ردیف تنظیمات یا `null` اگر هنوز ساخته نشده باشد. */
export async function findSettings(db: Db = prisma): Promise<Setting | null> {
  return db.setting.findUnique({ where: { id: SETTINGS_ID } });
}

/** ردیف تنظیمات را (در صورت نبود) می‌سازد و برمی‌گرداند — race-safe. */
export async function ensureSettings(db: Db = prisma): Promise<Setting> {
  return db.setting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS },
    update: {},
  });
}

/** به‌روزرسانی **جزئی**؛ فقط فیلدهای ارسالی نوشته می‌شوند. */
export async function updateSettings(
  data: Partial<SettingsColumns>,
  db: Db = prisma,
): Promise<Setting> {
  return db.setting.update({ where: { id: SETTINGS_ID }, data });
}

import { SETTINGS_FIELDS } from "../constants/setting.constants.js";
import type { SettingsColumns } from "../types/setting.types.js";

/**
 * فقط ستون‌های قابل‌تنظیم را کپی می‌کند (بدون مقادیر مشتق‌شده یا متادیتای ردیف).
 *
 * هم برای خواندن از یک ردیف Prisma استفاده می‌شود و هم برای جدا کردن ستون‌ها از
 * یک `AppSettings` — تنها یک پیاده‌سازی وجود دارد.
 */
export function pickSettingsColumns(source: SettingsColumns): SettingsColumns {
  const columns = {} as SettingsColumns;
  for (const field of SETTINGS_FIELDS) {
    columns[field] = source[field];
  }
  return columns;
}

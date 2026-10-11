import { BookingStatus, UserRole } from "../generated/prisma/enums.js";

//* مقادیر قابل‌تنظیم (طول اقامت، maxGuests، افق رزرو، مهلت پرداخت و ...) در جدول
//* `Setting` نگهداری می‌شوند و در runtime از `cache/setting.store` خوانده می‌شوند؛
//* پیش‌فرض‌ها در `constants/setting.constants` (DEFAULT_SETTINGS) هستند.

export const TIMEZONE = "Asia/Tehran" as const;

export const BOOKING_ADMIN_ROLES: readonly UserRole[] = ["admin", "owner"];

/** زمان‌بندی جاب انقضای رزروهای `pending` (هر دقیقه). */
export const BOOKING_EXPIRATION_CRON = "*/1 * * * *";

export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["cancelled"],
  confirmed: ["checkedIn", "cancelled"],
  checkedIn: ["checkedOut"],
  checkedOut: [],
  cancelled: [],
};

//* وضعیت‌هایی که یک بازه را «اشغال‌شده» نشان می‌دهند
export const OCCUPYING_STATUSES: BookingStatus[] = ["confirmed", "checkedIn"];

/**
 * وضعیت‌هایی که در «رتبه‌بندی محبوبیت» (تعداد رزرو) شمرده می‌شوند.
 *
 * یعنی رزروهای واقعی‌شده: تأییدشده، تحویل‌گرفته و تخلیه‌شده. رزروهای
 * `pending` و `cancelled` در شمارش نمی‌آیند.
 */
export const RANKING_STATUSES: BookingStatus[] = ["confirmed", "checkedIn", "checkedOut"];

export const BOOKING_STATUS_DB: Record<BookingStatus, string> = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
  checkedIn: "checked_in",
  checkedOut: "checked_out",
};

/** همان `RANKING_STATUSES` ولی به‌صورت لیست آماده‌ی SQL برای `IN (...)`. */
export const RANKING_STATUS_SQL_LIST = RANKING_STATUSES.map(
  (status) => `'${BOOKING_STATUS_DB[status]}'`,
).join(", ");

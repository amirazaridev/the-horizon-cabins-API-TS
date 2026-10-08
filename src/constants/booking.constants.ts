import { BookingStatus, UserRole } from "../generated/prisma/enums.js";

//* مقادیر قابل‌تنظیم (min/max booking length، maxGuests، افق رزرو و ...) در
//* جدول `Setting` نگهداری می‌شوند و از `services/setting.store` خوانده می‌شوند.
//* مقادیر زیر صرفاً پیش‌فرض‌های دامنه‌اند (منبع DEFAULT_SETTINGS).

export const TIMEZONE = "Asia/Tehran" as const;

export const BOOKING_ADMIN_ROLES: readonly UserRole[] = ["admin", "owner"];

export const BOOKING_CONSTANTS = {
  PAYMENT_DEADLINE_MINUTES: 30,
  MAX_PENDING_BOOKINGS_PER_GUEST: 3,
  MIN_BOOKING_LENGTH_NIGHTS: 1,
  MAX_BOOKING_LENGTH_NIGHTS: 30,
  MAX_GUESTS_PER_BOOKING: 10,
  MAX_ADVANCE_BOOKING_DAYS: 120,
  BOOKED_DATES_MAX_RANGE_DAYS: 121,
  EXPIRATION_CHECK_CRON: "*/1 * * * *",
} as const;

export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["cancelled"],
  confirmed: ["checkedIn", "cancelled"],
  checkedIn: ["checkedOut"],
  checkedOut: [],
  cancelled: [],
};

//* وضعیت‌هایی که یک بازه را «اشغال‌شده» نشان می‌دهند
export const OCCUPYING_STATUSES: BookingStatus[] = ["confirmed", "checkedIn"];

export const BOOKING_STATUS_DB: Record<BookingStatus, string> = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
  checkedIn: "checked-in",
  checkedOut: "checked-out",
};

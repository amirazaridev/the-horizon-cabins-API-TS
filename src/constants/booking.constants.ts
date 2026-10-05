import { BookingStatus, UserRole } from "../generated/prisma/enums.js";

export const TIMEZONE = "Asia/Tehran" as const;

export const BOOKING_ADMIN_ROLES: readonly UserRole[] = ["admin", "owner"];

export const BOOKING_CONSTANTS = {
  PAYMENT_DEADLINE_MINUTES: 30,
  MAX_PENDING_BOOKINGS_PER_GUEST: 3,
  MIN_BOOKING_LENGTH_NIGHTS: 1,
  MAX_BOOKING_LENGTH_NIGHTS: 30,
  MAX_GUESTS_PER_BOOKING: 10,
  //* از ۳۶۵ به ۱۲۰ کاهش یافت؛ هم‌راستا با افق تقویم قیمت (PRICE_CALENDAR_HORIZON_DAYS).
  MAX_ADVANCE_BOOKING_DAYS: 120,
  //* کوچک‌ترین مقدار سازگار با افق جدید: MAX_ADVANCE_BOOKING_DAYS + 1.
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

/**
 * نگاشت مقدار enum پریزما به literal واقعی دیتابیس (ستون booking_status).
 * پریزما مقادیر camelCase می‌فرستد، اما DB مقادیر @map شده را می‌شناسد
 * (مثلاً "checkedIn" → "checked-in"). برای تزریق خام در SQL لازم است.
 */
export const BOOKING_STATUS_DB: Record<BookingStatus, string> = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
  checkedIn: "checked-in",
  checkedOut: "checked-out",
};

interface BookingSettings {
  paymentDeadlineMinutes: number;
  maxPendingBookingsPerGuest: number;
  minBookingLengthNights: number;
  maxBookingLengthNights: number;
  maxGuestsPerBooking: number;
  maxAdvanceBookingDays: number;
  bookedDatesMaxRangeDays: number;
  expirationCheckCron: string;
}

export function getBookingSettings(): BookingSettings {
  return {
    paymentDeadlineMinutes: BOOKING_CONSTANTS.PAYMENT_DEADLINE_MINUTES,
    maxPendingBookingsPerGuest: BOOKING_CONSTANTS.MAX_PENDING_BOOKINGS_PER_GUEST,
    minBookingLengthNights: BOOKING_CONSTANTS.MIN_BOOKING_LENGTH_NIGHTS,
    maxBookingLengthNights: BOOKING_CONSTANTS.MAX_BOOKING_LENGTH_NIGHTS,
    maxGuestsPerBooking: BOOKING_CONSTANTS.MAX_GUESTS_PER_BOOKING,
    maxAdvanceBookingDays: BOOKING_CONSTANTS.MAX_ADVANCE_BOOKING_DAYS,
    bookedDatesMaxRangeDays: BOOKING_CONSTANTS.BOOKED_DATES_MAX_RANGE_DAYS,
    expirationCheckCron: BOOKING_CONSTANTS.EXPIRATION_CHECK_CRON,
  };
}

import { BookingStatus, UserRole } from "../generated/prisma/enums.js";

export const BOOKING_ADMIN_ROLES: readonly UserRole[] = ["admin", "owner"];

export const BOOKING_CONSTANTS = {
  PAYMENT_DEADLINE_MINUTES: 30,
  MAX_PENDING_BOOKINGS_PER_GUEST: 3,
  MIN_BOOKING_LENGTH_NIGHTS: 1,
  MAX_BOOKING_LENGTH_NIGHTS: 30,
  MAX_GUESTS_PER_BOOKING: 10,
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

interface BookingSettings {
  paymentDeadlineMinutes: number;
  maxPendingBookingsPerGuest: number;
  minBookingLengthNights: number;
  maxBookingLengthNights: number;
  maxGuestsPerBooking: number;
  expirationCheckCron: string;
}

export function getBookingSettings(): BookingSettings {
  return {
    paymentDeadlineMinutes: BOOKING_CONSTANTS.PAYMENT_DEADLINE_MINUTES,
    maxPendingBookingsPerGuest: BOOKING_CONSTANTS.MAX_PENDING_BOOKINGS_PER_GUEST,
    minBookingLengthNights: BOOKING_CONSTANTS.MIN_BOOKING_LENGTH_NIGHTS,
    maxBookingLengthNights: BOOKING_CONSTANTS.MAX_BOOKING_LENGTH_NIGHTS,
    maxGuestsPerBooking: BOOKING_CONSTANTS.MAX_GUESTS_PER_BOOKING,
    expirationCheckCron: BOOKING_CONSTANTS.EXPIRATION_CHECK_CRON,
  };
}

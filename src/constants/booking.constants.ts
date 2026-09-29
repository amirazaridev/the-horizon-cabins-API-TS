import { BookingStatus } from "../generated/prisma/enums.js";

export const BOOKING_CONSTANTS = {
  PAYMENT_DEADLINE_MINUTES: 30,
  MAX_PENDING_BOOKINGS_PER_GUEST: 3,
  MIN_BOOKING_LENGTH_NIGHTS: 1,
  MAX_BOOKING_LENGTH_NIGHTS: 30,
  MAX_GUESTS_PER_BOOKING: 10,
  EXPIRATION_CHECK_CRON: "*/1 * * * *",
} as const;

export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checkedIn"],
  checkedIn: ["checkedOut"],
  checkedOut: [],
  cancelled: [],
};

//* این وضعیت‌ها یعنی کابین برای بازه‌ی تاریخ رزرو، اشغال/محجوز است.
//* رزرو "checkedOut" تمام شده و نباید مانع رزرو جدید شود.
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["pending", "confirmed", "checkedIn"];

export interface BookingSettings {
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

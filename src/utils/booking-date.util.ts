import { isAfter, isBefore } from "date-fns";
import { AppError } from "./AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { getBookingSettings, TIMEZONE } from "../constants/booking.constants.js";
import { addDaysUtc, nightsBetween, todayInTimezone } from "./date.util.js";

export interface StayRange {
  startDate: Date;
  endDate: Date;
}

export interface ValidatedStayRange extends StayRange {
  numNights: number;
  today: Date;
}

/**
 * اعتبارسنجی مشترک بازه‌ی اقامت — **تنها منبع** قواعد تاریخ رزرو.
 *
 * این تابع هم در `createBooking` و هم در endpoint «قیمت‌گذاری» استفاده می‌شود
 * تا کپی جداگانه‌ای از قواعد وجود نداشته باشد.
 *
 * قواعد:
 *  - `startDate >= today` (Asia/Tehran)
 *  - `startDate <= today + MAX_ADVANCE_BOOKING_DAYS`
 *  - `endDate > startDate`
 *  - `MIN_BOOKING_LENGTH_NIGHTS <= numNights <= MAX_BOOKING_LENGTH_NIGHTS`
 *  - قاعده‌ی افق: `endDate <= today + MAX_ADVANCE_BOOKING_DAYS`
 */
export function validateStayRange(
  range: StayRange,
  now: Date = new Date(),
): ValidatedStayRange {
  const settings = getBookingSettings();
  const today = todayInTimezone(TIMEZONE, now);

  if (isBefore(range.startDate, today)) {
    throw new AppError(
      "Start date cannot be in the past",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  if (isAfter(range.startDate, addDaysUtc(today, settings.maxAdvanceBookingDays))) {
    throw new AppError(
      `Start date cannot be more than ${settings.maxAdvanceBookingDays} days in the future`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  if (!isAfter(range.endDate, range.startDate)) {
    throw new AppError(
      "End date must be after start date",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  //* قاعده‌ی افق روی endDate (آخرین شب = endDate - 1 → حداکثر today + MAX - 1).
  if (isAfter(range.endDate, addDaysUtc(today, settings.maxAdvanceBookingDays))) {
    throw new AppError(
      `End date cannot be more than ${settings.maxAdvanceBookingDays} days in the future`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  const numNights = nightsBetween(range.startDate, range.endDate);

  if (
    numNights < settings.minBookingLengthNights ||
    numNights > settings.maxBookingLengthNights
  ) {
    throw new AppError(
      `Booking must be between ${settings.minBookingLengthNights} and ${settings.maxBookingLengthNights} nights`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  return { startDate: range.startDate, endDate: range.endDate, numNights, today };
}

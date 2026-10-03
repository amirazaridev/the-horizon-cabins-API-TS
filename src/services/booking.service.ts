import { addMinutes, isAfter, isBefore } from "date-fns";
import { Prisma } from "../generated/prisma/client.js";
import type { Booking, UserRole } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { getBookingSettings, TIMEZONE } from "../constants/booking.constants.js";
import { isValidStatusTransition, hasFullBookingAccess } from "../utils/booking.util.js";
import { simulatePaymentGateway } from "../utils/payment.util.js";
import { calculateCabinPrice, calculateTotalPrice } from "../utils/booking-price.util.js";
import { withSerializableRetry } from "../utils/transaction.util.js";
import * as bookingRepository from "../repositories/booking.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
import { prisma } from "../config/database.js";
import type { z } from "zod";
import type {
  createBookingSchema,
  updateBookingStatusSchema,
} from "../validations/booking.validation.js";
import type { PaginatedResult, PaginationParams } from "../types/pagination.types.js";
import { getPaginationMeta } from "../utils/pagination.utils.js";
import type { BookedDatesQuery, BookingFilters } from "../types/booking.types.js";
import { addDaysUtc, nightsBetween, todayInTimezone } from "../utils/date.util.js";

type CreateBookingInput = z.infer<typeof createBookingSchema.body>;
type UpdateStatusInput = z.infer<typeof updateBookingStatusSchema.body>;

function assertBookingOwnership(booking: { guest: { userId: number } }, userId: number) {
  if (booking.guest.userId !== userId) {
    throw new AppError(
      "You do not have permission to access this booking",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.BOOKING_FORBIDDEN,
    );
  }
}

/** نسخه‌ی داخلی؛ شامل guest.userId برای چک ownership و وضعیت. */
async function getBookingWithOwnerOrThrow(id: number) {
  const booking = await bookingRepository.findBookingWithOwnerById(id);
  if (!booking) {
    throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, ErrorCode.BOOKING_NOT_FOUND);
  }
  return booking;
}

/** نسخه‌ی پاسخ API؛ بدون guest.userId. بعد از هر عملیاتی که رکورد را تغییر می‌دهد استفاده می‌شود. */
async function getBookingResponseOrThrow(id: number) {
  const booking = await bookingRepository.findBookingById(id);
  if (!booking) {
    throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, ErrorCode.BOOKING_NOT_FOUND);
  }
  return booking;
}

export async function createBooking(input: CreateBookingInput, userId: number): Promise<Booking> {
  const now = new Date();

  const guest = await guestRepository.findGuestByUserId(userId);
  if (!guest) {
    throw new AppError("Guest profile not found", HTTP_STATUS.FORBIDDEN, ErrorCode.FORBIDDEN);
  }

  const settings = getBookingSettings();

  const today = todayInTimezone(TIMEZONE, now);
  if (isBefore(input.startDate, today)) {
    throw new AppError(
      "Start date cannot be in the past",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  //* حداکثر فاصله‌ی startDate از امروز
  if (isAfter(input.startDate, addDaysUtc(today, settings.maxAdvanceBookingDays))) {
    throw new AppError(
      `Start date cannot be more than ${settings.maxAdvanceBookingDays} days in the future`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  if (!isAfter(input.endDate, input.startDate)) {
    throw new AppError(
      "End date must be after start date",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  const numNights = nightsBetween(input.startDate, input.endDate);

  if (numNights < settings.minBookingLengthNights || numNights > settings.maxBookingLengthNights) {
    throw new AppError(
      `Booking must be between ${settings.minBookingLengthNights} and ${settings.maxBookingLengthNights} nights`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  const cabin = await cabinRepository.findCabinById(input.cabinId);
  if (!cabin) {
    throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  const maxGuests = Math.min(cabin.maxCapacity, settings.maxGuestsPerBooking);
  if (input.numGuests > maxGuests) {
    throw new AppError(
      `Maximum ${maxGuests} guests allowed for this cabin`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_GUEST_CAPACITY_EXCEEDED,
    );
  }

  const cabinPrice = calculateCabinPrice(cabin.regularPrice, cabin.discount);
  const totalPrice = calculateTotalPrice(cabinPrice, numNights);
  const paymentDeadline = addMinutes(now, settings.paymentDeadlineMinutes);

  //* تراکنش ممکن است چند بار اجرا شود؛ پس هیچ side effect بیرون از آن داخل callback نگذار.
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await bookingRepository.expirePendingBookings(now, { cabinId: input.cabinId }, tx);

        const hasOverlap = await bookingRepository.hasOverlappingBooking(
          input.cabinId,
          input.startDate,
          input.endDate,
          now,
          tx,
        );

        if (hasOverlap) {
          throw new AppError(
            "Cabin is not available for the selected dates",
            HTTP_STATUS.CONFLICT,
            ErrorCode.BOOKING_DATE_OVERLAP,
          );
        }

        const pendingCount = await bookingRepository.countPendingBookingsForGuest(
          now,
          guest.id,
          tx,
        );

        if (pendingCount >= settings.maxPendingBookingsPerGuest) {
          throw new AppError(
            `You can have at most ${settings.maxPendingBookingsPerGuest} pending bookings`,
            HTTP_STATUS.CONFLICT,
            ErrorCode.BOOKING_PENDING_LIMIT_EXCEEDED,
          );
        }

        return bookingRepository.createBooking(
          {
            startDate: input.startDate,
            endDate: input.endDate,
            numNights,
            numGuests: input.numGuests,
            cabinPrice,
            totalPrice,
            status: "pending",
            paymentDeadline,
            observations: input.observations,
            cabin: { connect: { id: input.cabinId } },
            guest: { connect: { id: guest.id } },
          },
          tx,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export async function getAllBookings(
  params: PaginationParams & {
    filters: BookingFilters;
    role: UserRole;
    userId: number;
  },
): Promise<PaginatedResult<Booking>> {
  const { skip, limit, page, filters, role, userId } = params;

  const finalFilters = hasFullBookingAccess(role) ? filters : { ...filters, guestUserId: userId };

  const { data, total } = await bookingRepository.findAllBookings({
    skip,
    limit,
    filters: finalFilters,
  });
  return { data, meta: getPaginationMeta(total, page, limit) };
}

export async function getBookingById(id: number, userId: number, role: UserRole): Promise<Booking> {
  const booking = await getBookingWithOwnerOrThrow(id);

  if (!hasFullBookingAccess(role)) {
    assertBookingOwnership(booking, userId);
  }

  return getBookingResponseOrThrow(id);
}

export async function payBooking(id: number, userId: number): Promise<Booking> {
  const now = new Date();

  const booking = await getBookingWithOwnerOrThrow(id);
  assertBookingOwnership(booking, userId);

  if (booking.status !== "pending") {
    throw new AppError(
      "This booking has already been processed",
      HTTP_STATUS.CONFLICT,
      ErrorCode.BOOKING_ALREADY_PROCESSED,
    );
  }

  //* هم‌خوان با شرط paymentDeadline > paidAt در confirmPendingBooking
  if (booking.paymentDeadline <= now) {
    throw new AppError(
      "The payment deadline for this booking has passed",
      HTTP_STATUS.CONFLICT,
      ErrorCode.BOOKING_EXPIRED,
    );
  }

  const confirmed = await bookingRepository.confirmPendingBooking(id, {
    paidAt: now,
    paymentReference: simulatePaymentGateway(),
  });

  if (!confirmed) {
    throw new AppError(
      "This booking is no longer payable",
      HTTP_STATUS.CONFLICT,
      ErrorCode.BOOKING_ALREADY_PROCESSED,
    );
  }

  return getBookingResponseOrThrow(id);
}

export async function cancelBooking(id: number, userId: number): Promise<Booking> {
  const now = new Date();

  const booking = await getBookingWithOwnerOrThrow(id);
  assertBookingOwnership(booking, userId);

  if (booking.status !== "pending") {
    throw new AppError(
      "Only pending bookings can be cancelled",
      HTTP_STATUS.CONFLICT,
      ErrorCode.BOOKING_CANNOT_CANCEL,
    );
  }
  const cancelled = await bookingRepository.cancelPendingBooking(id, now, "userCancelled");

  if (!cancelled) {
    throw new AppError(
      "Only pending bookings can be cancelled",
      HTTP_STATUS.CONFLICT,
      ErrorCode.BOOKING_CANNOT_CANCEL,
    );
  }

  return getBookingResponseOrThrow(id);
}

export async function updateBookingStatus(id: number, input: UpdateStatusInput): Promise<Booking> {
  const now = new Date();

  const booking = await getBookingWithOwnerOrThrow(id);

  if (!isValidStatusTransition(booking.status, input.status)) {
    throw new AppError(
      `Cannot transition from ${booking.status} to ${input.status}`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
    );
  }

  //* چک‌این فقط از تاریخ شروع رزرو به بعد مجاز است
  if (input.status === "checkedIn" && isBefore(todayInTimezone(TIMEZONE, now), booking.startDate)) {
    throw new AppError(
      "Check-in is not allowed before the booking start date",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
    );
  }

  const data: Prisma.BookingUpdateManyMutationInput =
    input.status === "cancelled"
      ? { status: input.status, cancelledAt: now, cancellationReason: "adminCancelled" }
      : { status: input.status };

  const updated = await bookingRepository.transitionBookingStatus(id, booking.status, data);

  if (!updated) {
    throw new AppError(
      "Booking status was changed by another request, please retry",
      HTTP_STATUS.CONFLICT,
      ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
    );
  }

  return getBookingResponseOrThrow(id);
}

export async function expirePendingBookings(): Promise<number> {
  const now = new Date();
  return bookingRepository.expirePendingBookings(now);
}

interface BookedRangeResult {
  startDate: Date;
  endDate: Date;
}

export async function getBookedDates(
  cabinId: number,
  query: BookedDatesQuery,
): Promise<BookedRangeResult[]> {
  const now = new Date();

  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) {
    throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  const settings = getBookingSettings();

  const from = query.from ?? todayInTimezone(TIMEZONE, now);
  const to = query.to ?? addDaysUtc(from, settings.bookedDatesMaxRangeDays);

  if (to.getTime() - from.getTime() > settings.bookedDatesMaxRangeDays * 86_400_000) {
    throw new AppError(
      `Date range cannot exceed ${settings.bookedDatesMaxRangeDays} days`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_DATE_RANGE,
    );
  }

  const ranges = await bookingRepository.findBookedDateRanges(cabinId, { from, to }, now);

  return ranges.map((range) => ({
    startDate: range.startDate,
    endDate: range.endDate,
  }));
}

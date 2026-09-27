import { addMinutes, isAfter, isBefore, isPast } from "date-fns";
import { randomUUID } from "crypto";
import { Prisma } from "../generated/prisma/client.js";
import type { Booking, BookingStatus, UserRole } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { getBookingSettings, VALID_STATUS_TRANSITIONS } from "../constants/booking.constants.js";
import {
  calculateCabinPrice,
  calculateNumNights,
  calculateTotalPrice,
} from "../utils/booking-price.util.js";
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
import { BookingFilters } from "../types/booking.types.js";

type CreateBookingInput = z.infer<typeof createBookingSchema.body>;
type UpdateStatusInput = z.infer<typeof updateBookingStatusSchema.body>;



export function isValidStatusTransition(current: BookingStatus, target: BookingStatus): boolean {
  return VALID_STATUS_TRANSITIONS[current]?.includes(target) ?? false;
}

export function hasOverlappingBooking(
  existingBookings: Array<{ startDate: Date; endDate: Date }>,
  startDate: Date,
  endDate: Date,
): boolean {
  return existingBookings.some(
    (booking) => isBefore(booking.startDate, endDate) && isAfter(booking.endDate, startDate),
  );
}

function simulatePaymentGateway(): string {
  return randomUUID();
}

export async function createBooking(input: CreateBookingInput, userId: number): Promise<Booking> {
  const guest = await guestRepository.findGuestByUserId(userId);
  if (!guest) {
    throw new AppError("Guest profile not found", HTTP_STATUS.FORBIDDEN, ErrorCode.FORBIDDEN);
  }

  const settings = getBookingSettings();

  if (isPast(input.startDate)) {
    throw new AppError(
      "Start date cannot be in the past",
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

  const numNights = calculateNumNights(input.startDate, input.endDate);

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
  const paymentDeadline = addMinutes(new Date(), settings.paymentDeadlineMinutes);

  const booking = await prisma.$transaction(
    async (tx) => {
      const overlapping = await bookingRepository.findOverlappingBooking(
        input.cabinId,
        input.startDate,
        input.endDate,
        tx,
      );

      if (overlapping) {
        throw new AppError(
          "Cabin is not available for the selected dates",
          HTTP_STATUS.CONFLICT,
          ErrorCode.BOOKING_DATE_OVERLAP,
        );
      }

      const pendingCount = await bookingRepository.countPendingBookingsForGuest(
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

      return bookingRepository.createBooking({
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
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return booking;
}

export async function getAllBookings(
  params: PaginationParams & {
    filters: BookingFilters;
    role: UserRole;
    userId?: number;
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

export async function getBookingById(
  id: number,
  userId: number,
  role: UserRole,
): Promise<Booking> {
  const booking = await bookingRepository.findBookingById(id);
  if (!booking) {
    throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, ErrorCode.BOOKING_NOT_FOUND);
  }

  if (hasFullBookingAccess(role) && booking.guest.userId !== userId) {
    const guest = await guestRepository.findGuestByUserId(userId);
    if (!guest || booking.guestId !== guest.id) {
      throw new AppError(
        "You do not have permission to view this booking",
        HTTP_STATUS.FORBIDDEN,
        ErrorCode.BOOKING_FORBIDDEN,
      );
    }
  }

  return booking;
}

export async function payBooking(id: number, userId: number): Promise<Booking> {
  const booking = await bookingRepository.findBookingById(id);
  if (!booking) {
    throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, ErrorCode.BOOKING_NOT_FOUND);
  }

  if (booking.guest.userId !== userId) {
    throw new AppError(
      "You do not have permission to pay for this booking",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.BOOKING_FORBIDDEN,
    );
  }

  if (booking.status !== "pending") {
    throw new AppError(
      "این رزرو قبلاً پردازش شده است",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_ALREADY_PROCESSED,
    );
  }

  if (booking.paymentDeadline && isPast(booking.paymentDeadline)) {
    throw new AppError(
      "مهلت پرداخت این رزرو گذشته است",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_EXPIRED,
    );
  }

  const paymentReference = simulatePaymentGateway();

  return bookingRepository.updateBooking(id, {
    status: "confirmed",
    paidAt: new Date(),
    paymentReference,
  });
}

export async function cancelBooking(id: number, userId: number): Promise<Booking> {
  const booking = await bookingRepository.findBookingById(id);
  if (!booking) {
    throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, ErrorCode.BOOKING_NOT_FOUND);
  }
  
  if (booking.guest.userId !== userId) {
    throw new AppError(
      "You do not have permission to cancel this booking",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.BOOKING_FORBIDDEN,
    );
  }

  if (booking.status !== "pending") {
    throw new AppError(
      "Only pending bookings can be cancelled",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_CANNOT_CANCEL,
    );
  }

  return bookingRepository.updateBooking(id, {
    status: "cancelled",
    cancelledAt: new Date(),
    cancellationReason: "userCancelled",
  });
}

export async function updateBookingStatus(id: number, input: UpdateStatusInput): Promise<Booking> {
  const booking = await bookingRepository.findBookingById(id);
  if (!booking) {
    throw new AppError("Booking not found", HTTP_STATUS.NOT_FOUND, ErrorCode.BOOKING_NOT_FOUND);
  }

  if (!isValidStatusTransition(booking.status, input.status)) {
    throw new AppError(
      `Cannot transition from ${booking.status} to ${input.status}`,
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
    );
  }

  return bookingRepository.updateBooking(id, { status: input.status });
}

export async function expirePendingBookings(): Promise<number> {
  return bookingRepository.expirePendingBookings(new Date());
}
export function hasFullBookingAccess(role: UserRole): boolean {
  return role === "admin" || role === "owner";
}

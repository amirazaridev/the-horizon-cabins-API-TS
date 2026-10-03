import { prisma, PrismaTransactionClient } from "../config/database.js";
import { ACTIVE_BOOKING_STATUSES } from "../constants/booking.constants.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Booking, BookingStatus, CancellationReason } from "../generated/prisma/client.js";
import { BookingFilters, FindAllBookingsParams } from "../types/booking.types.js";

type Db = typeof prisma | PrismaTransactionClient;

function buildWhereClause(filters: BookingFilters): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.cabinId !== undefined) where.cabinId = filters.cabinId;
  if (filters.guestId !== undefined) where.guestId = filters.guestId;
  if (filters.guestUserId !== undefined) where.guest = { userId: filters.guestUserId };
  if (filters.startDateFrom || filters.startDateTo) {
    where.startDate = {};
    if (filters.startDateFrom) where.startDate.gte = filters.startDateFrom;
    if (filters.startDateTo) where.startDate.lte = filters.startDateTo;
  }

  return where;
}

export async function findAllBookings({ skip, limit, filters }: FindAllBookingsParams) {
  const where = buildWhereClause(filters);
  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        cabin: { select: { id: true, name: true } },
        guest: { select: { id: true, fullName: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);
  return { data, total };
}

export async function findBookingById(id: number) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      guest: { select: { id: true, userId: true, fullName: true } },
      cabin: { select: { id: true, name: true } },
    },
  });
}

export async function findOverlappingBooking(
  cabinId: number,
  startDate: Date,
  endDate: Date,
  db: Db = prisma,
): Promise<Booking | null> {
  return db.booking.findFirst({
    where: {
      cabinId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
  });
}

export async function countPendingBookingsForGuest(
  guestId: number,
  db: Db = prisma,
): Promise<number> {
  return db.booking.count({
    where: { guestId, status: "pending" },
  });
}

export interface BookedRange {
  startDate: Date;
  endDate: Date;
}

/**
 * بازه‌های تاریخِ قفل‌شده‌ی یک کابین را برمی‌گرداند.
 * فقط رزروهای فعال (pending/confirmed/checkedIn) به‌عنوان تاریخ‌های رزرو‌شده در نظر گرفته می‌شوند.
 */
export async function findBookedDateRanges(
  cabinId: number,
  options: { from?: Date; to?: Date } = {},
  db: Db = prisma,
): Promise<BookedRange[]> {
  return db.booking.findMany({
    where: {
      cabinId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      ...(options.to && { startDate: { lt: options.to } }),
      ...(options.from && { endDate: { gt: options.from } }),
    },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
}

export async function createBooking(
  data: Prisma.BookingCreateInput,
  db: Db = prisma,
): Promise<Booking> {
  return db.booking.create({ data });
}

export async function updateBooking(
  id: number,
  data: Prisma.BookingUpdateInput,
  db: Db = prisma,
): Promise<Booking> {
  return db.booking.update({ where: { id }, data });
}
/** فقط اگر هنوز pending و مهلت پرداخت نگذشته باشد، تایید می‌کند. */
export async function confirmPendingBooking(
  id: number,
  data: { paidAt: Date; paymentReference: string },
  db: Db = prisma,
): Promise<boolean> {
  const { count } = await db.booking.updateMany({
    where: { id, status: "pending", paymentDeadline: { gt: data.paidAt } },
    data: { status: "confirmed", paidAt: data.paidAt, paymentReference: data.paymentReference },
  });
  return count === 1;
}

/** فقط اگر هنوز pending باشد، لغو می‌کند. */
export async function cancelPendingBooking(
  id: number,
  cancelledAt: Date,
  reason: CancellationReason,
  db: Db = prisma,
): Promise<boolean> {
  const { count } = await db.booking.updateMany({
    where: { id, status: "pending" },
    data: { status: "cancelled", cancelledAt, cancellationReason: reason },
  });
  return count === 1;
}

/** فقط اگر status هنوز همان مقداری باشد که اعتبارسنجی روی آن انجام شده، تغییر می‌دهد. */
export async function transitionBookingStatus(
  id: number,
  from: BookingStatus,
  data: Prisma.BookingUpdateManyMutationInput,
  db: Db = prisma,
): Promise<boolean> {
  const { count } = await db.booking.updateMany({
    where: { id, status: from },
    data,
  });
  return count === 1;
}

export async function expirePendingBookings(now: Date): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: { status: "pending", paymentDeadline: { lt: now } },
    data: {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "paymentExpired" as CancellationReason,
    },
  });
  return result.count;
}

import { prisma, PrismaTransactionClient } from "../config/database.js";
import { OCCUPYING_STATUSES } from "../constants/booking.constants.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Booking, BookingStatus, CancellationReason } from "../generated/prisma/client.js";
// نکته: Booking برای امضای توابع create/update همچنان لازم است.
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

function activeBookingFilter(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: OCCUPYING_STATUSES } },
      { status: "pending", paymentDeadline: { gt: now } },
    ],
  };
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

/** select پاسخ؛ شامل userId نیست چون نباید به کلاینت برسد. */
const bookingResponseSelect = {
  id: true,
  startDate: true,
  endDate: true,
  numNights: true,
  numGuests: true,
  cabinPrice: true,
  totalPrice: true,
  status: true,
  paymentDeadline: true,
  paidAt: true,
  paymentReference: true,
  cancelledAt: true,
  cancellationReason: true,
  observations: true,
  createdAt: true,
  updatedAt: true,
  cabinId: true,
  guestId: true,
  guest: { select: { id: true, fullName: true } },
  cabin: { select: { id: true, name: true } },
  nights: {
    select: {
      date: true,
      basePrice: true,
      discountPercent: true,
      surchargePercent: true,
      finalPrice: true,
      appliedRules: true,
    },
    orderBy: { date: "asc" },
  },
} satisfies Prisma.BookingSelect;

/**
 * نسخه‌ی داخلی برای سرویس؛ شامل `guest.userId` است تا چک ownership و وضعیت انجام شود.
 * این خروجی هرگز مستقیماً به controller برنمی‌گردد.
 */
export async function findBookingWithOwnerById(id: number) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      guest: { select: { id: true, userId: true, fullName: true } },
      cabin: { select: { id: true, name: true } },
    },
  });
}

/** نسخه‌ی پاسخ API؛ `guest.userId` را برنمی‌گرداند. */
export async function findBookingById(id: number, db: Db = prisma) {
  return db.booking.findUnique({
    where: { id },
    select: bookingResponseSelect,
  });
}

export async function hasOverlappingBooking(
  cabinId: number,
  startDate: Date,
  endDate: Date,
  now: Date,
  db: Db = prisma,
): Promise<boolean> {
  const result = await db.booking.findFirst({
    where: {
      cabinId,
      ...activeBookingFilter(now),
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
    select: { id: true },
  });
  return result !== null;
}

export async function countPendingBookingsForGuest(
  now: Date,
  guestId: number,
  db: Db = prisma,
): Promise<number> {
  return db.booking.count({
    where: { guestId, status: "pending", paymentDeadline: { gt: now } },
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
  range: { from: Date; to: Date },
  now: Date,
  db: Db = prisma,
): Promise<BookedRange[]> {
  return db.booking.findMany({
    where: {
      cabinId,
      ...activeBookingFilter(now),
      startDate: { lt: range.to },
      endDate: { gt: range.from },
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

export interface BookingNightInput {
  date: Date;
  basePrice: number;
  discountPercent: number;
  surchargePercent: number;
  finalPrice: number;
  appliedRules: Prisma.InputJsonValue;
}

/** درج اسنپ‌شات قیمت شب‌های یک رزرو (batch). */
export async function createBookingNights(
  bookingId: number,
  nights: BookingNightInput[],
  db: Db = prisma,
): Promise<number> {
  if (nights.length === 0) return 0;
  const { count } = await db.bookingNight.createMany({
    data: nights.map((night) => ({ bookingId, ...night })),
  });
  return count;
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

export async function expirePendingBookings(
  now: Date,
  options: { cabinId?: number } = {},
  db: Db = prisma,
): Promise<number> {
  const result = await db.booking.updateMany({
    where: {
      status: "pending",
      paymentDeadline: { lte: now },
      ...(options.cabinId !== undefined && { cabinId: options.cabinId }),
    },
    data: { status: "cancelled", cancelledAt: now, cancellationReason: "paymentExpired" },
  });
  return result.count;
}

/** تعداد رزروهای آینده‌ی غیرلغوشده با تعداد مهمان بیشتر از سقف داده‌شده. */
export async function countUpcomingBookingsAboveGuests(
  maxGuests: number,
  today: Date,
  db: Db = prisma,
): Promise<number> {
  return db.booking.count({
    where: {
      numGuests: { gt: maxGuests },
      status: { not: "cancelled" },
      endDate: { gte: today },
    },
  });
}

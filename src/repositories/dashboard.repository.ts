import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import { DASHBOARD_ACTIVE_STATUSES } from "../constants/dashboard.constants.js";
import { addDaysUtc } from "../utils/date.util.js";
import type { DashboardFilters, DateRange } from "../types/dashboard.types.js";

/**
 * select مشترک رزرو — دقیقاً فیلدهای `DashboardBooking` فرانت.
 * `observations` عمداً نیست (داشبورد لازم ندارد).
 */
export const dashboardBookingSelect = {
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
  cabinId: true,
  guestId: true,
  createdAt: true,
  updatedAt: true,
  guest: { select: { id: true, fullName: true } },
  cabin: { select: { id: true, name: true } },
} satisfies Prisma.BookingSelect;

/** select مشترک اقامتگاه — آینه‌ی `DashboardCabin` فرانت. */
export const dashboardCabinSelect = {
  id: true,
  name: true,
  maxCapacity: true,
  regularPrice: true,
  bedrooms: true,
  bathrooms: true,
  cityId: true,
  city: {
    select: {
      id: true,
      name: true,
      regionId: true,
      region: { select: { id: true, name: true, slug: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CabinSelect;

export type DashboardBookingRow = Prisma.BookingGetPayload<{
  select: typeof dashboardBookingSelect;
}>;

export type DashboardCabinRow = Prisma.CabinGetPayload<{
  select: typeof dashboardCabinSelect;
}>;

/**
 * شرط تداخل شب با بازه (نیم‌باز): `startDate < to+1 AND endDate > from`.
 * عیناً هم‌منطق با `overlapsRange` فرانت (شب خروج اقامت حساب نمی‌شود).
 */
function overlapRangeWhere(range: DateRange): Prisma.BookingWhereInput {
  return {
    startDate: { lt: addDaysUtc(range.to, 1) },
    endDate: { gt: range.from },
  };
}

/** فیلترهای مشترک شهر/اقامتگاه/وضعیت روی رزرو. */
function bookingFiltersWhere(filters: DashboardFilters): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (filters.cabinIds.length) where.cabinId = { in: filters.cabinIds };
  if (filters.cityIds.length) where.cabin = { cityId: { in: filters.cityIds } };
  if (filters.statuses) where.status = { in: filters.statuses };
  return where;
}

/** رزروهای متداخل با بازه + فیلترها (شامل رزروهای عبوری از مرز). */
export async function findBookingsInRange(
  range: DateRange,
  filters: DashboardFilters,
): Promise<DashboardBookingRow[]> {
  return prisma.booking.findMany({
    where: { ...overlapRangeWhere(range), ...bookingFiltersWhere(filters) },
    select: dashboardBookingSelect,
    orderBy: { startDate: "asc" },
  });
}

/** اقامتگاه‌های فعال بعد از فیلتر شهر/اقامتگاه. */
export async function findCabins(
  filters: DashboardFilters,
): Promise<DashboardCabinRow[]> {
  const where: Prisma.CabinWhereInput = {};
  if (filters.cabinIds.length) where.id = { in: filters.cabinIds };
  if (filters.cityIds.length) where.cityId = { in: filters.cityIds };

  return prisma.cabin.findMany({
    where,
    select: dashboardCabinSelect,
    orderBy: { id: "asc" },
  });
}

/** رزروهای امروز (ورود یا خروج امروز) — مستقل از بازه و فیلترها. */
export async function findTodayBookings(
  today: Date,
): Promise<DashboardBookingRow[]> {
  return prisma.booking.findMany({
    where: {
      status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
      OR: [{ startDate: today }, { endDate: today }],
    },
    select: dashboardBookingSelect,
    orderBy: { startDate: "asc" },
  });
}

/** رزروهای پیش‌رو — از امروز تا `horizonDays` روز بعد. */
export async function findForwardBookings(
  today: Date,
  horizonDays: number,
): Promise<DashboardBookingRow[]> {
  return prisma.booking.findMany({
    where: {
      status: { in: [...DASHBOARD_ACTIVE_STATUSES] },
      startDate: { gte: today, lte: addDaysUtc(today, horizonDays) },
    },
    select: dashboardBookingSelect,
    orderBy: { startDate: "asc" },
  });
}

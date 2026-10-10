import * as dashboardRepository from "../repositories/dashboard.repository.js";
import type {
  DashboardBookingRow,
  DashboardCabinRow,
} from "../repositories/dashboard.repository.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import { FORWARD_HORIZON_DAYS } from "../constants/dashboard.constants.js";
import { todayInTimezone } from "../utils/date.util.js";
import { resolveCompareRange } from "../utils/dashboard-range.util.js";
import { buildDashboardFilters } from "../utils/dashboard-filter.util.js";
import type { DashboardSnapshotQuery, DateRange } from "../types/dashboard.types.js";

/**
 * نتیجه‌ی کامل یک درخواست داشبورد — **هم‌شکل** با `DashboardSnapshot` فرانت.
 *
 * ⚠️ محاسبه‌ی شاخص‌ها (KPI/نمودار/جدول) عمداً سمت کلاینت می‌ماند؛ این
 * endpoint فقط **داده‌ی خام** را برمی‌گرداند تا توابع pure متریک یک‌جا و
 * بدون تکرار بین فرانت/بک بمانند (تصمیم معماری فاز برنامه‌ریزی).
 */
export interface DashboardSnapshot {
  bookings: DashboardBookingRow[];
  compareBookings: DashboardBookingRow[];
  cabins: DashboardCabinRow[];
  todayBookings: DashboardBookingRow[];
  forwardBookings: DashboardBookingRow[];
  range: DateRange;
  compareRange: DateRange | null;
  today: Date;
}

/**
 * بارگذاری همه‌ی داده‌ی لازم برای یک رندر داشبورد.
 *
 * - «امروز» به وقت **Asia/Tehran** حساب می‌شود (نه ساعت سرور).
 * - `compareBookings` روی بازه‌ی مقایسه با **همان فیلترها** می‌آید.
 * - `todayBookings`/`forwardBookings` عمداً **مستقل** از بازه و فیلترها هستند
 *   (ویجت‌های عملیاتی نباید با فیلتر شهر/وضعیت ناقص شوند).
 */
export async function getDashboardSnapshot(
  query: DashboardSnapshotQuery,
): Promise<DashboardSnapshot> {
  const today = todayInTimezone(TIMEZONE);
  const range: DateRange = { from: query.from, to: query.to };
  const compareRange = resolveCompareRange(range, query.compare);
  const filters = buildDashboardFilters(query);

  const [bookings, compareBookings, cabins, todayBookings, forwardBookings] =
    await Promise.all([
      dashboardRepository.findBookingsInRange(range, filters),
      compareRange
        ? dashboardRepository.findBookingsInRange(compareRange, filters)
        : Promise.resolve<DashboardBookingRow[]>([]),
      dashboardRepository.findCabins(filters),
      dashboardRepository.findTodayBookings(today),
      dashboardRepository.findForwardBookings(today, FORWARD_HORIZON_DAYS),
    ]);

  return {
    bookings,
    compareBookings,
    cabins,
    todayBookings,
    forwardBookings,
    range,
    compareRange,
    today,
  };
}

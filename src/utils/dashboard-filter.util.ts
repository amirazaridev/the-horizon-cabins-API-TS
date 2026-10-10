import { PAYMENT_STATUS_BOOKING_STATUSES } from "../constants/dashboard.constants.js";
import type { BookingStatus } from "../generated/prisma/enums.js";
import type {
  DashboardFilters,
  DashboardSnapshotQuery,
  PaymentStatus,
} from "../types/dashboard.types.js";

/**
 * وضعیت‌های مؤثر = اشتراک فیلتر «وضعیت» و فیلتر «وضعیت پرداخت».
 *
 * - هیچ‌کدام → `undefined` (بدون فیلتر)
 * - یکی → همان مجموعه
 * - هر دو → اشتراک (ممکن است خالی باشد ⇒ نتیجه‌ی خالی)
 */
export function resolveStatusFilter(
  statuses: readonly BookingStatus[] | undefined,
  paymentStatuses: readonly PaymentStatus[] | undefined,
): BookingStatus[] | undefined {
  const fromPayment = paymentStatuses?.length
    ? [
        ...new Set(
          paymentStatuses.flatMap(
            (status) => PAYMENT_STATUS_BOOKING_STATUSES[status],
          ),
        ),
      ]
    : undefined;

  if (!fromPayment) return statuses?.length ? [...statuses] : undefined;
  if (!statuses?.length) return fromPayment;

  const allowed = new Set(fromPayment);
  return statuses.filter((status) => allowed.has(status));
}

/** ساخت فیلترهای نرمال‌شده از ورودی خام. */
export function buildDashboardFilters(
  query: DashboardSnapshotQuery,
): DashboardFilters {
  return {
    cityIds: query.cityIds ?? [],
    cabinIds: query.cabinIds ?? [],
    statuses: resolveStatusFilter(query.statuses, query.paymentStatuses),
  };
}

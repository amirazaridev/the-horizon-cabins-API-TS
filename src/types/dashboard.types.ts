/**
 * تایپ‌های دامنه‌ی داشبورد مدیریتی (سمت API).
 *
 * این تایپ‌ها **آینه‌ی** `DashboardSnapshot`/`DashboardFilters` در فرانت‌اند
 * هستند (`the-horizon-cabins-next-app/src/features/dashboard/overview`) تا
 * مصرف‌کننده بتواند پاسخ را بدون تغییر شکل بدهد.
 */

import type { BookingStatus } from "../generated/prisma/enums.js";

/** حالت مقایسه — عیناً معادل مقادیر فرانت. */
export type CompareMode = "prev-period" | "prev-year" | "none";

/**
 * وضعیت پرداخت — **مشتق از `status`**، نه ستون دیتابیس.
 * `cancelled`/`pending` پرداخت‌نشده‌اند؛ بقیه پرداخت‌شده.
 */
export type PaymentStatus = "paid" | "unpaid";

/** بازه‌ی تاریخ — شامل هر دو سر. */
export interface DateRange {
  from: Date;
  to: Date;
}

/** فیلترهای نرمال‌شده‌ی داشبورد (خروجی `buildDashboardFilters`). */
export interface DashboardFilters {
  /** شهرهای انتخابی — آرایه‌ی خالی یعنی «بدون فیلتر». */
  cityIds: number[];
  /** اقامتگاه‌های انتخابی — آرایه‌ی خالی یعنی «بدون فیلتر». */
  cabinIds: number[];
  /**
   * وضعیت‌های مؤثر = اشتراک فیلتر «وضعیت» و فیلتر «وضعیت پرداخت».
   * `undefined` یعنی بدون فیلتر؛ آرایه‌ی خالی یعنی «نتیجه‌ی خالی».
   */
  statuses?: BookingStatus[];
}

/** ورودی اعتبارسنجی‌شده‌ی `GET /dashboard/snapshot`. */
export interface DashboardSnapshotQuery {
  from: Date;
  to: Date;
  compare: CompareMode;
  cityIds?: number[];
  cabinIds?: number[];
  statuses?: BookingStatus[];
  paymentStatuses?: PaymentStatus[];
}

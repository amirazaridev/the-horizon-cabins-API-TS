import type { BookingStatus } from "../generated/prisma/enums.js";
import type { PaymentStatus } from "../types/dashboard.types.js";

/**
 * وضعیت‌هایی که یک رزرو را «فعال» می‌دانند — مبنای ویجت‌های عملیاتی
 * (عملیات امروز / رزروهای پیش‌رو). عیناً معادل `ACTIVE_BOOKING_STATUSES` فرانت.
 *
 * ⚠️ با `OCCUPYING_STATUSES` بک‌اند (فقط `confirmed`/`checkedIn`) یکی **نیست**:
 * آن برای «قفل تاریخ» است و `pending` را جدا (با `paymentDeadline`) می‌بیند؛
 * این‌جا اما هر `pending` هم باید در لیست عملیات بیاید.
 */
export const DASHBOARD_ACTIVE_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "checkedIn",
];

/** نگاشت وضعیت پرداخت دوتایی → مجموعه‌ی وضعیت‌های رزرو. */
export const PAYMENT_STATUS_BOOKING_STATUSES: Record<
  PaymentStatus,
  readonly BookingStatus[]
> = {
  paid: ["confirmed", "checkedIn", "checkedOut"],
  unpaid: ["pending", "cancelled"],
};

/** افق «رزروهای پیش‌رو» (روز) — هم‌ارز `FORWARD_HORIZON_DAYS` فرانت. */
export const FORWARD_HORIZON_DAYS = 90;

/** سقف طول بازه‌ی داشبورد (روز) — گارد اندازه‌ی payload. */
export const MAX_DASHBOARD_RANGE_DAYS = 1095;

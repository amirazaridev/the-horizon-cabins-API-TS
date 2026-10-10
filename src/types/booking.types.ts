import { BookingStatus } from "../generated/prisma/enums.js";

export interface BookingFilters {
  status?: BookingStatus;
  /** فیلتر چندوضعیتی (داشبورد مدیریت) — بر `status` اولویت دارد. */
  statuses?: BookingStatus[];
  cabinId?: number;
  /** فیلتر شهر — از طریق رابطه‌ی اقامتگاه (`cabin.cityId`). */
  cityId?: number;
  guestId?: number;
  guestUserId?: number;
  /** جستجوی نام مهمان (`contains`، بدون حساسیت به بزرگی/کوچکی). */
  guestQuery?: string;
  startDateFrom?: Date;
  startDateTo?: Date;
}

export interface FindAllBookingsParams {
  skip: number;
  limit: number;
  filters: BookingFilters;
}

/** بازه‌ی تاریخ که برای آن باید تقویم بررسی شود (برای endpoint تاریخ‌های رزرو‌شده). */
export interface BookedDatesQuery {
  from?: Date;
  to?: Date;
}

import { BookingStatus } from "../generated/prisma/enums.js";

export interface BookingFilters {
  status?: BookingStatus;
  cabinId?: number;
  guestId?: number;
  guestUserId?: number;
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

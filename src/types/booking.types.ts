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
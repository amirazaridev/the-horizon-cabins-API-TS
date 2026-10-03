import type { BookingStatus, UserRole } from "../generated/prisma/client.js";
import { BOOKING_ADMIN_ROLES, VALID_STATUS_TRANSITIONS } from "../constants/booking.constants.js";


export function isValidStatusTransition(current: BookingStatus, target: BookingStatus): boolean {
  return VALID_STATUS_TRANSITIONS[current]?.includes(target) ?? false;
}

export function hasFullBookingAccess(role: UserRole): boolean {
  return BOOKING_ADMIN_ROLES.includes(role);
}

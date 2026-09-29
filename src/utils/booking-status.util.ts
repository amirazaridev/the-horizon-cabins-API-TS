import type { BookingStatus } from "../generated/prisma/client.js";
import { VALID_STATUS_TRANSITIONS } from "../constants/booking.constants.js";

/**
 * Returns true if a booking may move from `current` to `target`.
 * The transition table lives in `constants/booking.constants.ts`.
 */
export function isValidStatusTransition(current: BookingStatus, target: BookingStatus): boolean {
  return VALID_STATUS_TRANSITIONS[current]?.includes(target) ?? false;
}

import cron from "node-cron";
import { BOOKING_EXPIRATION_CRON } from "../constants/booking.constants.js";
import { expirePendingBookings } from "../services/booking.service.js";
import logger from "../config/logger.js";

export function startBookingExpirationJob(): void {
  cron.schedule(BOOKING_EXPIRATION_CRON, async () => {
    try {
      const expiredCount = await expirePendingBookings();
      if (expiredCount > 0) {
        logger.info(`Expired ${expiredCount} pending booking(s)`);
      }
    } catch (error) {
      logger.error("Failed to expire pending bookings", { error });
    }
  });

  void expirePendingBookings()
    .then((count) => {
      if (count > 0) {
        logger.info(`Initial expiration check: expired ${count} pending booking(s)`);
      }
    })
    .catch((error) => {
      logger.error("Failed initial expiration check", { error });
    });
}

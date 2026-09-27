import cron from "node-cron";
import { getBookingSettings } from "../constants/booking.constants.js";
import { expirePendingBookings } from "../services/booking.service.js";
import logger from "../config/logger.js";

export function startBookingExpirationJob(): void {
  const settings = getBookingSettings();

  cron.schedule(settings.expirationCheckCron, async () => {
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

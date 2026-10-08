import cron from "node-cron";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/database.js";
import logger from "../config/logger.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import { runDailyPriceCalendarMaintenance } from "../services/price-calendar.service.js";

/** هر روز ساعت ۰۰:۰۵ به وقت تهران. */
export const PRICE_CALENDAR_CRON = "0 5 0 * * *";

/** کلید قفل advisory برای جلوگیری از اجرای هم‌زمان دو نسخه. */
export const PRICE_CALENDAR_LOCK_KEY = 918_273_645;

export interface MaintenanceRunResult {
  ran: boolean;
  deleted: number;
  rebuiltCabins: number;
  failedCabins: number;
}

/*
 * اجرای نگه‌داری تقویم قیمت با محافظت در برابر اجرای هم‌زمان.
 *
 * از `pg_try_advisory_xact_lock` داخل یک تراکنش استفاده می‌کنیم (قفل در پایان
 * تراکنش خودکار آزاد می‌شود؛ با قفل session-level و connection pool، unlock
 * ممکن بود روی اتصال دیگری اجرا شود). کل جاب داخل همان تراکنش اجرا می‌شود و
 * در finally نیازی به unlock نیست؛ چون xact-lock خودش آزاد می‌شود.
 */
export async function runPriceCalendarMaintenanceGuarded(
  now: Date = new Date(),
): Promise<MaintenanceRunResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ locked: boolean }[]>(
      Prisma.sql`SELECT pg_try_advisory_xact_lock(${PRICE_CALENDAR_LOCK_KEY}::bigint) AS locked`,
    );

    if (!rows[0]?.locked) {
      logger.warn("Price calendar maintenance skipped: another run is already in progress");
      return { ran: false, deleted: 0, rebuiltCabins: 0, failedCabins: 0 };
    }

    const result = await runDailyPriceCalendarMaintenance(now, tx);
    return { ran: true, ...result };
  });
}

/** شروع جاب روزانه + یک اجرای self-healing هنگام بالا آمدن سرور. */
export function startPriceCalendarJob(): void {
  cron.schedule(
    PRICE_CALENDAR_CRON,
    () => {
      void runPriceCalendarMaintenanceGuarded().catch((error) => {
        logger.error("Price calendar maintenance failed", { error });
      });
    },
    { timezone: TIMEZONE },
  );

  void runPriceCalendarMaintenanceGuarded().catch((error) => {
    logger.error("Initial price calendar maintenance failed", { error });
  });
}

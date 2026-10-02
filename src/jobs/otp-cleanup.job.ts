import cron from "node-cron";
import { cleanupExpiredOtpRecords } from "../services/otp.service.js";
import logger from "../config/logger.js";

/**
 * پاک‌سازی دوره‌ای رکوردهای OTP قدیمی.
 *
 * ⚠️ چرا لازم است؟
 * هر درخواست/تایید یک ردیف می‌سازد و جدول با گذشت زمان بی‌دلیل بزرگ
 * می‌شود. ردیف‌های قدیمی هیچ ارزش عملیاتی ندارند (کد یک‌بارمصرف است و
 * منقضی شده)، پس حذفشان نه امنیت را کم می‌کند و نه audit لازم دارد.
 *
 * مثل جاب انقضای رزرو، این تابع فقط صادر می‌شود و در bootstrap صدا زده
 * می‌شود (به‌عمد خودش را با import شدن اجرا نمی‌کند تا قابل تست باشد).
 */
const CLEANUP_CRON = "0 4 * * *"; // هر روز ساعت ۰۴:۰۰

export function startOtpCleanupJob(): void {
  cron.schedule(CLEANUP_CRON, async () => {
    try {
      const removed = await cleanupExpiredOtpRecords();
      if (removed > 0) {
        logger.info(`Cleaned up ${removed} expired OTP record(s)`);
      }
    } catch (error) {
      logger.error("Failed to clean up expired OTP records", { error });
    }
  });
}

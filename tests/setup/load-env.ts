import { config } from "dotenv";
import { resolve } from "node:path";

/**
 * setup مشترکِ تست‌های unit.
 *
 * `config/env.ts` هنگام import، `process.env` را با اسکیمای Zod پارس می‌کند و
 * چون فایل‌های تست آن را (به‌واسطه‌ی import شدن) بارگذاری می‌کنند، باید قبل از
 * هر import دیگری متغیرهای محیطی تنظیم شده باشند. `setupFiles` در vitest پیش از
 * بارگذاری فایل تست اجرا می‌شود، پس همین‌جا `.env.test` را می‌خوانیم.
 *
 * نکته: این setup هیچ دیتابیسی نمی‌سازد؛ تست‌های unit دیتابیس ندارند.
 */
config({ path: resolve(process.cwd(), ".env.test"), quiet: true });

process.env.NODE_ENV = "test";

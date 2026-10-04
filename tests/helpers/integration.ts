import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, onTestFinished } from "vitest";
import { prisma } from "../../src/config/database.js";
import { resetDatabase, disconnectDatabase } from "./db.js";

/** همان مسیری که globalSetup می‌نویسد. */
const DB_STATUS_FILE = resolve(process.cwd(), "tests/setup/.db-available");

/**
 * خواندن وضعیت دسترسی دیتابیس به‌صورت همگام.
 *
 * `globalSetup` در پروسه‌ی جداگانه اجرا می‌شود، پس نمی‌تواند env را به
 * فایل‌های تست برساند. به‌جایش یک فایل علامت می‌نویسد که اینجا می‌خوانیم.
 * این تابع در زمان *collect* (قبل از beforeAll) اجرا می‌شود، پس می‌توانیم
 * با `describe.skipIf` فایل را تمیز skip کنیم.
 */
export function isIntegrationDbAvailable(): boolean {
  try {
    if (!existsSync(DB_STATUS_FILE)) {
      // بدون فایل علامت (اجرای مستقیم بدون globalSetup) → محافظه‌کارانه skip.
      return false;
    }
    return readFileSync(DB_STATUS_FILE, "utf8").trim() === "true";
  } catch {
    return false;
  }
}

export interface IntegrationHooks {
  db: typeof prisma;
  available: boolean;
}

/**
 * hookهای چرخه‌ی عمر یک فایل integration.
 * در beforeAll (فقط اگر دیتابیس در دسترس باشد) جداول TRUNCATE می‌شوند.
 */
export function useIntegrationDb(): IntegrationHooks {
  const available = isIntegrationDbAvailable();

  beforeAll(async () => {
    if (available) await resetDatabase();
  });

  afterAll(async () => {
    if (available) await disconnectDatabase().catch(() => undefined);
  });

  return { db: prisma, available };
}

/** پاک‌سازی فایل علامت (در teardown نهایی استفاده نمی‌شود؛ فقط مستندسازی). */
export function clearDbStatusFile(): void {
  rmSync(DB_STATUS_FILE, { force: true });
}

export { describe, onTestFinished };

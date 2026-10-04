import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertTestDatabase } from "./db-guard.js";

/** فایل علامت که وضعیت دسترسی دیتابیس را بین globalSetup و فایل‌های تست به اشتراک می‌گذارد. */
export const DB_STATUS_FILE = resolve(process.cwd(), "tests/setup/.db-available");

/**
 * global setup پروژه‌ی integration.
 *
 * کارهایی که انجام می‌دهد:
 *  ۱. `.env.test` را لود می‌کند (قبل از هر import پروژه‌ای).
 *  ۲. نام دیتابیس را با guard بررسی می‌کند (باید شامل test باشد).
 *  ۳. اتصال را تست می‌کند؛ اگر دیتابیس در دسترس نبود، `TEST_DB_AVAILABLE=false`
 *     ست می‌شود تا فایل‌های integration تمیز skip شوند.
 *  ۴. اگر در دسترس بود، `prisma migrate deploy` را روی دیتابیس تست اجرا
 *     می‌کند تا اسکیمای واقعی (شامل exclusion constraint دست‌نویس) اعمال شود.
 *
 * نکته: `globalSetup` و فایل‌های تست در پروسه‌های جدا اجرا می‌شوند، پس متغیر
 * محیطی اینجا به فایل تست نمی‌رسد. به همین دلیل `available` را در خود فایل
 * تست هم با $queryRaw تأیید می‌کنیم (در `useIntegrationDb`).
 * اینجا همان متغیر را ست می‌کنیم تا در اجرای تک‌پروسه‌ای هم کار کند.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
  process.env.NODE_ENV = "test";

  const databaseUrl = process.env.DATABASE_URL;
  assertTestDatabase(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch (error) {
    process.env.TEST_DB_AVAILABLE = "false";
    writeFileSync(DB_STATUS_FILE, "false", "utf8");
    console.warn(
      `\n[tests] ⚠️  Test database is not reachable — integration tests will be SKIPPED.\n` +
        `        Reason: ${(error as Error).message}\n` +
        `        Provision it with: npm run test:db:setup   (see README)\n`,
    );
    await client.end().catch(() => undefined);
    return;
  }

  await client.end();
  process.env.TEST_DB_AVAILABLE = "true";
  writeFileSync(DB_STATUS_FILE, "true", "utf8");

  // اعمال migrationها روی دیتابیس تست.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
    shell: process.platform === "win32",
  });
}

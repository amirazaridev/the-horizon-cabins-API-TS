import { config } from "dotenv";
import { resolve } from "node:path";
import { Client } from "pg";
import { parseDatabaseName } from "./db-guard.js";

/**
 * ساخت دیتابیس تست (اگر وجود نداشته باشد) و اعمال migrationها.
 *
 * اجرا: npm run test:db:setup
 *
 * این اسکریپت:
 *  ۱. `.env.test` را می‌خواند (DATABASE_URL مخصوص تست).
 *  ۲. نام دیتابیس را بررسی می‌کند (باید شامل test باشد).
 *  ۳. با اتصال به دیتابیس `postgres`، دیتابیس تست را CREATE می‌کند (idempotent).
 *  ۴. به کاربر می‌گوید migrationها را چطور اعمال کند (خود globalSetup هنگام تست
 *     این کار را `prisma migrate deploy` انجام می‌دهد).
 */
async function main(): Promise<void> {
  config({ path: resolve(process.cwd(), ".env.test"), quiet: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in .env.test");
  }

  const dbName = parseDatabaseName(databaseUrl);
  if (!dbName || !/test/i.test(dbName)) {
    throw new Error(
      `Refusing to create database "${dbName}": the test database name must contain "test".`,
    );
  }

  // ساخت URL ادمین با همان پارامترها اما دیتابیس `postgres`.
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();

  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (existing.rowCount === 0) {
    // نام دیتابیس اعتبارسنجی شده و از .env.test می‌آید؛ کوتیشن برای امنیت بیشتر.
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.warn(`[test-db] Created database "${dbName}".`);
  } else {
    console.warn(`[test-db] Database "${dbName}" already exists.`);
  }

  await client.end();

  console.warn(
    `[test-db] Done. Migrations are applied automatically by the integration global setup\n` +
      `         (prisma migrate deploy), or run manually:\n` +
      `         DATABASE_URL="${databaseUrl}" npx prisma migrate deploy`,
  );
}

main().catch((error) => {
  console.error("[test-db] Failed:", (error as Error).message);
  throw error;
});

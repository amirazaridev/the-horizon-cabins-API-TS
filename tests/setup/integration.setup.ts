import { config } from "dotenv";
import { resolve } from "node:path";
import { assertTestDatabase, parseDatabaseName } from "./db-guard.js";

/**
 * setup فایل‌های integration — قبل از بارگذاری فایل تست اجرا می‌شود.
 *
 * `.env.test` را لود می‌کند تا `config/env.ts` مقادیر درست تست را ببیند،
 * و یک بررسی همگام از دسترس‌پذیری دیتابیس انجام می‌دهد.
 */

config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
process.env.NODE_ENV = "test";

export const TEST_DB_NAME = parseDatabaseName(process.env.DATABASE_URL);

// اگر نام دیتابیس نامعتبر باشد، همین‌جا با خطای واضح متوقف می‌شویم.
// (guard نمی‌گذارد تست‌ها روی دیتابیس غیرتست اجرا شوند.)
assertTestDatabase(process.env.DATABASE_URL);

import { defineConfig } from "vitest/config";

/**
 * پروژه‌ی integration — با دیتابیس Postgres تست واقعی.
 *
 * - `fileParallelism: false`: فایل‌های تست به‌صورت ترتیبی اجرا می‌شوند تا
 *   فایل‌های مختلف روی یک دیتابیس با TRUNCATE با هم تداخل نکنند.
 * - globalSetup: قطع دسترسی به دیتابیس تست را الزامی می‌کند و migrationها
 *   را روی دیتابیس تست اعمال می‌کند.
 * - اگر دیتابیس تست در دسترس نباشد، فایل‌های integration به‌صورت تمیز skip
 *   می‌شوند (تست‌های unit را خراب نمی‌کنند).
 */
export default defineConfig({
  test: {
    name: "integration",
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    setupFiles: ["./tests/setup/integration.setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    maxWorkers: 1
  },
});

import { defineConfig } from "vitest/config";

/**
 * پیکربندی پیش‌فرض vitest.
 *
 * ⚠️ تست‌ها به دو پروژه تقسیم شده‌اند؛ لطفاً از همان اسکریپت‌های npm استفاده کنید:
 *   - npm run test            → unit  (بدون دیتابیس)
 *   - npm run test:integration → integration (با دیتابیس تست)
 *
 * این فایل برای سازگاری نگه داشته شده و به‌طور پیش‌فرض پروژه‌ی unit را اجرا
 * می‌کند تا `npx vitest` هم نتیجه‌ی درست بدهد.
 */
export default defineConfig({
  test: {
    name: "unit",
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup/load-env.ts"],
    env: {
      NODE_ENV: "test",
    },
  },
});

import { defineConfig } from "vitest/config";

/**
 * پروژه‌ی unit — بدون دیتابیس و سریع.
 * تست‌های unit فقط چیزهای pure و mock‌شده را پوشش می‌دهند.
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

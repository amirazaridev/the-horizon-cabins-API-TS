import { prisma } from "../../src/config/database.js";

/**
 * تشخیص در دسترس بودن دیتابیس تست در زمان اجرا.
 * فایل‌های integration در `beforeAll` این را صدا می‌زنند و در نبود دیتابیس skip می‌شوند.
 */
let cached: boolean | null = null;

export async function isDatabaseReachable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await prisma.$queryRaw`SELECT 1`;
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** فقط برای تست‌ها: ریست کش بین فایل‌ها. */
export function resetDatabaseReachabilityCache(): void {
  cached = null;
}

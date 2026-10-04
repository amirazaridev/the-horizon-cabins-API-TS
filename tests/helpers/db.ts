import { prisma } from "../../src/config/database.js";

/**
 * پاک‌سازی دیتابیس بین تست‌ها.
 *
 * از TRUNCATE ... RESTART IDENTITY CASCADE استفاده می‌کنیم تا:
 *  - همه‌ی ردیف‌ها پاک شوند،
 *  - شمارنده‌ی id ریست شود (تست‌ها به idهای تکرارپذیر تکیه می‌کنند)،
 *  - ترتیب حذف مهم نباشد (CASCADE روابط را حل می‌کند).
 *
 * این تابع عمداً جدول‌ها را در یک لیست صریح نگه می‌دارد تا اگر جدول جدیدی
 * اضافه شد، آگاهانه اضافه شود.
 */
const TRUNCATABLE_TABLES = [
  "bookings",
  "guests",
  "users",
  "cabins",
  "cities",
  "regions",
  "settings",
  "verification_codes",
] as const;

export async function resetDatabase(): Promise<void> {
  const tableList = TRUNCATABLE_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

/** قطع اتصال (برای afterAll فایل‌ها). */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

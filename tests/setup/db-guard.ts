/**
 * محافظ دیتابیس تست.
 *
 * ⚠️ قاعده‌ی طلایی: تست‌های integration هرگز نباید روی دیتابیس
 * development/production اجرا شوند. `TRUNCATE ... CASCADE` در cleanup
 * می‌تواند تمام داده‌ی یک دیتابیس واقعی را نابود کند. پس قبل از هر اتصال،
 * نام دیتابیس را بررسی می‌کنیم و در صورت نبود «test» در آن، هارد-فِیل می‌کنیم.
 */

/** استخراج نام دیتابیس از یک connection string بدون وابستگی به پکیج اضافه. */
export function parseDatabaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    const url = new URL(databaseUrl);
    const name = url.pathname.replace(/^\//, "");
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

export function assertTestDatabase(databaseUrl: string | undefined): string {
  const name = parseDatabaseName(databaseUrl);
  if (!name) {
    throw new Error(
      "[tests] DATABASE_URL is missing or invalid. Set it in .env.test (see .env.test).",
    );
  }
  if (!/test/i.test(name)) {
    throw new Error(
      `[tests] Refusing to run against database "${name}": the database name must contain "test". ` +
        `Integration tests TRUNCATE tables, so pointing them at a non-test database would destroy data.`,
    );
  }
  return name;
}

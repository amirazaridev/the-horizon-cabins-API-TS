import { Prisma } from "../generated/prisma/client.js";

/** کد خطای Prisma برای تضاد در تراکنش‌های Serializable (write conflict / deadlock). */
const SERIALIZABLE_CONFLICT_CODE = "P2034";

function isSerializableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === SERIALIZABLE_CONFLICT_CODE
  );
}

/** backoff کوتاه با کمی jitter تا تراکنش‌های رقیب همزمان retry نکنند. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * اجرای یک عملیات با retry برای خطای P2034.
 * فقط خطای تضاد Serializable دوباره تلاش می‌شود؛ بقیه‌ی خطاها بلافاصله throw می‌شوند.
 * بعد از اتمام تلاش‌ها، خود خطای P2034 دوباره throw می‌شود.
 */
export async function withSerializableRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;

  // حلقه تا زمانی که تلاش‌ها تمام شوند
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (!isSerializableConflict(error) || attempt >= retries) {
        throw error;
      }
      attempt += 1;
      const backoff = 50 + Math.floor(Math.random() * 50);
      await delay(backoff);
    }
  }
}

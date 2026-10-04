import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "../../../src/generated/prisma/client.js";
import { withSerializableRetry } from "../../../src/utils/transaction.util.js";

/**
 * ساخت یک خطای واقعی Prisma با کد مورد نظر.
 * `PrismaClientKnownRequestError` سازنده‌ی عمومی دارد و برای تست کافی است.
 */
function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "7.0.0-test",
  });
}

/**
 * helper: یک promise + handler تزریق‌شده بساز تا rejection قبل از
 * اجرای تایمرها هندل شده باشد (جلوگیری از unhandled rejection).
 */
function withHandler<T>(fn: () => Promise<T>) {
  const promise = fn();
  const result = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  return { promise, result };
}

describe("transaction.util / withSerializableRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should return the result without retrying when the first attempt succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withSerializableRetry(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry once on P2034 and succeed on the next attempt", async () => {
    const fn = vi.fn().mockRejectedValueOnce(prismaError("P2034")).mockResolvedValue("recovered");

    const { result } = withHandler(() => withSerializableRetry(fn));
    await vi.advanceTimersByTimeAsync(200);

    await expect(result).resolves.toEqual({ ok: true, value: "recovered" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should rethrow the original P2034 after exhausting all retries", async () => {
    const error = prismaError("P2034");
    const fn = vi.fn().mockRejectedValue(error);

    const { result } = withHandler(() => withSerializableRetry(fn, 2));
    // ۲ تلاش مجدد → ۳ فراخوانی کل؛ هر بار تا سقف backoff جلو می‌رویم.
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should respect a custom retries count", async () => {
    const error = prismaError("P2034");
    const fn = vi.fn().mockRejectedValue(error);

    const { result } = withHandler(() => withSerializableRetry(fn, 0));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({ ok: false, error });
    // retries=0 یعنی فقط یک تلاش.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry a non-P2034 Prisma error and throw immediately", async () => {
    const error = prismaError("P2002");
    const fn = vi.fn().mockRejectedValue(error);

    const { result } = withHandler(() => withSerializableRetry(fn));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry an ordinary Error and throw immediately", async () => {
    const error = new Error("business failure");
    const fn = vi.fn().mockRejectedValue(error);

    const { result } = withHandler(() => withSerializableRetry(fn));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry an AppError (operational error)", async () => {
    const error = new Error("Cabin is not available for the selected dates");
    error.name = "AppError";
    const fn = vi.fn().mockRejectedValue(error);

    const { result } = withHandler(() => withSerializableRetry(fn));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({ ok: false, error });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should wait between 50 and 100 ms (inclusive) for backoff", async () => {
    const fn = vi.fn().mockRejectedValueOnce(prismaError("P2034")).mockResolvedValue("done");

    const { result } = withHandler(() => withSerializableRetry(fn));

    // بعد از 49ms هنوز retry شروع نشده.
    await vi.advanceTimersByTimeAsync(49);
    expect(fn).toHaveBeenCalledTimes(1);

    // در 100ms قطعاً فراخوانی دوم انجام شده است.
    await vi.advanceTimersByTimeAsync(60);
    await expect(result).resolves.toEqual({ ok: true, value: "done" });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

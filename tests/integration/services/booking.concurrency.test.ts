import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createUser, createCabin, utcDate } from "../../helpers/factories.js";
import { createBooking as createBookingService } from "../../../src/services/booking.service.js";
import { AppError } from "../../../src/utils/AppError.js";
import { ErrorCode } from "../../../src/constants/errorCodes.js";
import { prisma } from "../../../src/config/database.js";

useIntegrationDb();

/**
 * تست هم‌زمانی در سطح سرویس با دیتابیس واقعی.
 *
 * هدف: وقتی چند درخواست یک بازه‌ی یکسان را هم‌زمان رزرو می‌کنند، فقط یکی موفق
 * شود و بقیه با خطای ۴۰۹ (نه ۵۰۰ یا خطای ناشناخته) برگردند.
 */
describe.skipIf(!isIntegrationDbAvailable())("createBooking concurrency (integration)", () => {
  let cabinId: number;
  let guestUserId: number;

  beforeEach(async () => {
    await resetDatabase();
    cabinId = (await createCabin({ regularPrice: 1_000_000 })).id;
    guestUserId = (await createUser({ role: "guest" })).id;

    // مهمان دوم و سوم برای پرهیز از برخورد سقف pending در سناریوی هم‌زمانی.
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  /** ساخت چند کاربرِ مهمان جداگانه تا سقف pending هرکدام مستقل باشد. */
  async function manyGuests(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i += 1) {
      ids.push((await createUser({ role: "guest" })).id);
    }
    return ids;
  }

  /** تاریخ‌های near-future که سقف MAX_ADVANCE_BOOKING_DAYS را رد نکنند. */
  function futureRange(offsetDays: number, nights = 2) {
    const start = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + nights * 24 * 60 * 60 * 1000);
    return {
      startDate: utcDate(start.toISOString().slice(0, 10)),
      endDate: utcDate(end.toISOString().slice(0, 10)),
    };
  }

  it("should let exactly one of N concurrent identical bookings win", async () => {
    const count = 5;
    const userIds = await manyGuests(count);
    const input = { cabinId, ...futureRange(30), numGuests: 1 };

    const results = await Promise.allSettled(
      userIds.map((userId) => createBookingService(input, userId)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    // دقیقاً یکی موفق.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(count - 1);

    // هیچ خطای ناشناخته/۵۰۰ نباید باشد؛ همه باید AppError با ۴۰۹ باشند.
    for (const r of rejected) {
      const error = r.reason as unknown;
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode).toBe(409);
      expect([ErrorCode.BOOKING_DATE_OVERLAP, ErrorCode.TRANSACTION_CONFLICT]).toContain(
        appError.code,
      );
    }

    // فقط یک رزرو در دیتابیس ساخته شده است.
    const bookings = await prisma.booking.findMany({ where: { cabinId } });
    expect(bookings).toHaveLength(1);
  });

  it("should let exactly one of two concurrent bookings for the same guest win", async () => {
    const input = { cabinId, ...futureRange(60), numGuests: 1 };

    const results = await Promise.allSettled([
      createBookingService(input, guestUserId),
      createBookingService(input, guestUserId),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const r of rejected) {
      expect((r.reason as AppError).statusCode).toBe(409);
    }

    const bookings = await prisma.booking.findMany({ where: { cabinId } });
    expect(bookings).toHaveLength(1);
  });

  it("should allow disjoint concurrent bookings to all succeed", async () => {
    const userIds = await manyGuests(2);
    const inputA = { cabinId, ...futureRange(90, 2), numGuests: 1 };
    const inputB = { cabinId, ...futureRange(120, 2), numGuests: 1 };

    const results = await Promise.allSettled([
      createBookingService(inputA, userIds[0]),
      createBookingService(inputB, userIds[1]),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await prisma.booking.count()).toBe(2);
  });

  it("should not leak a raw database error (500) when the exclusion constraint fires", async () => {
    const userIds = await manyGuests(3);
    const input = { cabinId, ...futureRange(150), numGuests: 1 };

    const results = await Promise.allSettled(
      userIds.map((userId) => createBookingService(input, userId)),
    );

    for (const r of results) {
      if (r.status === "rejected") {
        const error = r.reason as AppError;
        // هرگز نباید خطای خام Prisma (بدون statusCode) بیرون بزند.
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBeLessThan(500);
      }
    }
  });
});

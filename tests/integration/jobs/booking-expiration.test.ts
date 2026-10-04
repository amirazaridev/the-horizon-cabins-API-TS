import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createUser, createCabin, createBooking, utcDate } from "../../helpers/factories.js";
import { expirePendingBookings } from "../../../src/services/booking.service.js";
import { prisma } from "../../../src/config/database.js";

useIntegrationDb();

/**
 * تست handler انقضای رزرو (همان تابعی که cron هر دقیقه صدا می‌زند).
 * خود cron زمان‌بندی نمی‌شود؛ فقط منطق انقضا تست می‌شود.
 */
describe.skipIf(!isIntegrationDbAvailable())("booking-expiration (integration)", () => {
  let cabinId: number;
  let guestId: number;

  beforeEach(async () => {
    await resetDatabase();
    cabinId = (await createCabin()).id;
    guestId = (await createUser({ role: "guest" })).guestId!;
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  it("should cancel expired pending bookings and leave other statuses untouched", async () => {
    // بازه‌های زمانی متمایز تا exclusion constraint فعال نشود.
    await createBooking({
      cabinId,
      guestId,
      status: "pending",
      paymentDeadline: new Date(Date.now() - 60_000),
      startDate: utcDate("2030-06-01"),
      endDate: utcDate("2030-06-03"),
    });
    await createBooking({
      cabinId,
      guestId,
      status: "pending",
      paymentDeadline: new Date(Date.now() + 60_000),
      startDate: utcDate("2030-06-05"),
      endDate: utcDate("2030-06-07"),
    });
    await createBooking({
      cabinId,
      guestId,
      status: "confirmed",
      startDate: utcDate("2030-06-10"),
      endDate: utcDate("2030-06-12"),
    });
    await createBooking({
      cabinId,
      guestId,
      status: "checkedIn",
      startDate: utcDate("2030-06-15"),
      endDate: utcDate("2030-06-17"),
    });

    const expired = await expirePendingBookings();

    expect(expired).toBe(1);

    const statuses = await prisma.booking.groupBy({ by: ["status"], _count: true });
    const counts = Object.fromEntries(statuses.map((s) => [s.status, s._count]));
    expect(counts).toMatchObject({ pending: 1, confirmed: 1, checkedIn: 1, cancelled: 1 });
  });

  it("should set cancellationReason=paymentExpired on expired rows", async () => {
    await createBooking({
      cabinId,
      guestId,
      status: "pending",
      paymentDeadline: new Date(Date.now() - 60_000),
    });

    await expirePendingBookings();

    const cancelled = await prisma.booking.findFirstOrThrow({ where: { status: "cancelled" } });
    expect(cancelled.cancellationReason).toBe("paymentExpired");
  });

  it("should be idempotent (a second run expires nothing more)", async () => {
    await createBooking({
      cabinId,
      guestId,
      status: "pending",
      paymentDeadline: new Date(Date.now() - 60_000),
    });

    const first = await expirePendingBookings();
    const second = await expirePendingBookings();

    expect(first).toBe(1);
    expect(second).toBe(0);
  });
});

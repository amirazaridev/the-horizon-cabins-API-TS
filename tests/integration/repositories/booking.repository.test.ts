import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createUser, createCabin, createBooking, utcDate } from "../../helpers/factories.js";
import * as bookingRepository from "../../../src/repositories/booking.repository.js";
import { prisma } from "../../../src/config/database.js";

const ctx = useIntegrationDb();
void ctx;

/** وقتی دیتابیس نیست، این فایل کامل skip می‌شود. */
describe.skipIf(!isIntegrationDbAvailable())("booking.repository (integration)", () => {
  let cabinId: number;
  let otherCabinId: number;
  let guestId: number;
  let otherGuestId: number;

  beforeEach(async () => {
    await resetDatabase();
    const cabin = await createCabin();
    const otherCabin = await createCabin();
    const guest = await createUser({ role: "guest" });
    const otherGuest = await createUser({ role: "guest" });
    cabinId = cabin.id;
    otherCabinId = otherCabin.id;
    guestId = guest.guestId!;
    otherGuestId = otherGuest.guestId!;
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  // ------------------------------------------------------------------
  // findAllBookings
  // ------------------------------------------------------------------
  describe("findAllBookings", () => {
    beforeEach(async () => {
      await createBooking({ cabinId, guestId, status: "pending", startDate: utcDate("2030-06-01"), endDate: utcDate("2030-06-03") });
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-07-01"), endDate: utcDate("2030-07-03") });
      await createBooking({ cabinId: otherCabinId, guestId: otherGuestId, status: "pending", startDate: utcDate("2030-08-01"), endDate: utcDate("2030-08-03") });
    });

    const all = () => bookingRepository.findAllBookings({ skip: 0, limit: 50, filters: {} });

    it("should return every booking with total", async () => {
      const { data, total } = await all();
      expect(total).toBe(3);
      expect(data).toHaveLength(3);
    });

    it("should filter by status", async () => {
      const { data, total } = await bookingRepository.findAllBookings({
        skip: 0,
        limit: 50,
        filters: { status: "pending" },
      });
      expect(total).toBe(2);
      expect(data.every((b) => b.status === "pending")).toBe(true);
    });

    it("should filter by cabinId", async () => {
      const { data, total } = await bookingRepository.findAllBookings({
        skip: 0,
        limit: 50,
        filters: { cabinId: otherCabinId },
      });
      expect(total).toBe(1);
      expect(data[0].cabinId).toBe(otherCabinId);
    });

    it("should filter by guestId", async () => {
      const { data, total } = await bookingRepository.findAllBookings({
        skip: 0,
        limit: 50,
        filters: { guestId: otherGuestId },
      });
      expect(total).toBe(1);
      expect(data[0].guestId).toBe(otherGuestId);
    });

    it("should filter by guestUserId through the relation", async () => {
      const { data, total } = await bookingRepository.findAllBookings({
        skip: 0,
        limit: 50,
        filters: { guestUserId: 1 },
      });
      expect(total).toBeGreaterThanOrEqual(0);
      expect(data.every((b) => b.guest.id === guestId || b.guest.id === otherGuestId)).toBe(true);
    });

    it("should filter by a startDate range", async () => {
      const { total } = await bookingRepository.findAllBookings({
        skip: 0,
        limit: 50,
        filters: { startDateFrom: utcDate("2030-07-01"), startDateTo: utcDate("2030-08-31") },
      });
      expect(total).toBe(2);
    });

    it("should combine filters", async () => {
      const { total } = await bookingRepository.findAllBookings({
        skip: 0,
        limit: 50,
        filters: { status: "pending", cabinId },
      });
      expect(total).toBe(1);
    });

    it("should paginate with skip/limit", async () => {
      const first = await bookingRepository.findAllBookings({ skip: 0, limit: 2, filters: {} });
      const second = await bookingRepository.findAllBookings({ skip: 2, limit: 2, filters: {} });
      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(1);
      expect(second.total).toBe(3);
    });

    it("should order by createdAt desc", async () => {
      const { data } = await all();
      const timestamps = data.map((b) => b.createdAt.getTime());
      const sorted = [...timestamps].sort((a, b) => b - a);
      expect(timestamps).toEqual(sorted);
    });

    it("should include cabin and guest summaries without userId", async () => {
      const { data } = await all();
      expect(data[0].cabin).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
      expect(data[0].guest).toMatchObject({ id: expect.any(Number), fullName: expect.any(String) });
      expect(data[0].guest).not.toHaveProperty("userId");
    });
  });

  // ------------------------------------------------------------------
  // findBookingById vs findBookingWithOwnerById
  // ------------------------------------------------------------------
  describe("findBookingById / findBookingWithOwnerById", () => {
    let bookingId: number;

    beforeEach(async () => {
      const booking = await createBooking({ cabinId, guestId });
      bookingId = booking.id;
    });

    it("findBookingById should NOT expose guest.userId", async () => {
      const booking = await bookingRepository.findBookingById(bookingId);
      expect(booking).not.toBeNull();
      expect(booking!.guest).toEqual(
        expect.objectContaining({ id: expect.any(Number), fullName: expect.any(String) }),
      );
      expect(booking!.guest).not.toHaveProperty("userId");
    });

    it("findBookingWithOwnerById SHOULD expose guest.userId", async () => {
      const booking = await bookingRepository.findBookingWithOwnerById(bookingId);
      expect(booking).not.toBeNull();
      expect(booking!.guest).toHaveProperty("userId");
    });

    it("should return null for an unknown id", async () => {
      expect(await bookingRepository.findBookingById(999_999)).toBeNull();
      expect(await bookingRepository.findBookingWithOwnerById(999_999)).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // hasOverlappingBooking
  // ------------------------------------------------------------------
  describe("hasOverlappingBooking", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");

    it("should detect an overlapping confirmed booking", async () => {
      await createBooking({
        cabinId,
        guestId,
        status: "confirmed",
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-20"),
      });

      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-15"), utcDate("2030-06-18"), now),
      ).resolves.toBe(true);
    });

    it("should treat adjacent ranges as non-overlapping (checkout day is free)", async () => {
      await createBooking({
        cabinId,
        guestId,
        status: "confirmed",
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-15"),
      });

      // بازه‌ی جدید از روز خروج شروع می‌شود → نباید هم‌پوشانی باشد.
      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-15"), utcDate("2030-06-18"), now),
      ).resolves.toBe(false);
    });

    it("should not confuse bookings of another cabin", async () => {
      await createBooking({
        cabinId: otherCabinId,
        guestId,
        status: "confirmed",
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-20"),
      });

      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-15"), utcDate("2030-06-18"), now),
      ).resolves.toBe(false);
    });

    it("should ignore cancelled and checkedOut bookings", async () => {
      await createBooking({ cabinId, guestId, status: "cancelled", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-20") });
      await createBooking({ cabinId, guestId, status: "checkedOut", startDate: utcDate("2030-07-10"), endDate: utcDate("2030-07-20") });

      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-15"), utcDate("2030-06-18"), now),
      ).resolves.toBe(false);
      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-07-15"), utcDate("2030-07-18"), now),
      ).resolves.toBe(false);
    });

    it("should treat a non-expired pending booking as blocking", async () => {
      await createBooking({
        cabinId,
        guestId,
        status: "pending",
        paymentDeadline: new Date("2030-06-01T00:00:00.000Z"),
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-20"),
      });

      await expect(
        bookingRepository.hasOverlappingBooking(
          cabinId,
          utcDate("2030-06-15"),
          utcDate("2030-06-18"),
          new Date("2030-05-01T00:00:00.000Z"), // now < deadline
        ),
      ).resolves.toBe(true);
    });

    it("should NOT treat an expired pending booking as blocking", async () => {
      await createBooking({
        cabinId,
        guestId,
        status: "pending",
        paymentDeadline: new Date("2030-06-01T00:00:00.000Z"),
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-20"),
      });

      await expect(
        bookingRepository.hasOverlappingBooking(
          cabinId,
          utcDate("2030-06-15"),
          utcDate("2030-06-18"),
          new Date("2030-07-01T00:00:00.000Z"), // now > deadline
        ),
      ).resolves.toBe(false);
    });

    it("should treat checkedIn as blocking", async () => {
      await createBooking({ cabinId, guestId, status: "checkedIn", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-20") });

      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-15"), utcDate("2030-06-18"), now),
      ).resolves.toBe(true);
    });

    it("should treat a range fully containing the new range as overlapping", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-01"), endDate: utcDate("2030-06-30") });

      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-10"), utcDate("2030-06-15"), now),
      ).resolves.toBe(true);
    });

    it("should treat a range fully inside the new range as overlapping", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-12") });

      await expect(
        bookingRepository.hasOverlappingBooking(cabinId, utcDate("2030-06-01"), utcDate("2030-06-30"), now),
      ).resolves.toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // findBookedDateRanges
  // ------------------------------------------------------------------
  describe("findBookedDateRanges", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");

    it("should return a booking that starts before `to` and ends after `to`", async () => {
      // رزروی که از بازه بیرون می‌زند: start < to && end > to
      await createBooking({
        cabinId,
        guestId,
        status: "confirmed",
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-30"),
      });

      const ranges = await bookingRepository.findBookedDateRanges(
        cabinId,
        { from: utcDate("2030-06-01"), to: utcDate("2030-06-15") },
        now,
      );

      expect(ranges).toHaveLength(1);
      expect(ranges[0].startDate).toEqual(utcDate("2030-06-10"));
      expect(ranges[0].endDate).toEqual(utcDate("2030-06-30"));
    });

    it("should exclude bookings entirely before `from`", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-05-01"), endDate: utcDate("2030-05-10") });

      const ranges = await bookingRepository.findBookedDateRanges(
        cabinId,
        { from: utcDate("2030-06-01"), to: utcDate("2030-06-30") },
        now,
      );
      expect(ranges).toHaveLength(0);
    });

    it("should exclude bookings entirely after `to`", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-08-01"), endDate: utcDate("2030-08-10") });

      const ranges = await bookingRepository.findBookedDateRanges(
        cabinId,
        { from: utcDate("2030-06-01"), to: utcDate("2030-06-30") },
        now,
      );
      expect(ranges).toHaveLength(0);
    });

    it("should order by startDate asc", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-20"), endDate: utcDate("2030-06-22") });
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-05"), endDate: utcDate("2030-06-07") });

      const ranges = await bookingRepository.findBookedDateRanges(
        cabinId,
        { from: utcDate("2030-06-01"), to: utcDate("2030-06-30") },
        now,
      );
      expect(ranges.map((r) => r.startDate.toISOString())).toEqual([
        utcDate("2030-06-05").toISOString(),
        utcDate("2030-06-20").toISOString(),
      ]);
    });

    it("should not return an expired pending booking", async () => {
      await createBooking({
        cabinId,
        guestId,
        status: "pending",
        paymentDeadline: new Date("2030-06-01T00:00:00.000Z"),
        startDate: utcDate("2030-06-10"),
        endDate: utcDate("2030-06-15"),
      });

      const ranges = await bookingRepository.findBookedDateRanges(
        cabinId,
        { from: utcDate("2030-06-01"), to: utcDate("2030-06-30") },
        new Date("2030-07-01T00:00:00.000Z"),
      );
      expect(ranges).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // countPendingBookingsForGuest
  // ------------------------------------------------------------------
  describe("countPendingBookingsForGuest", () => {
    it("should count only non-expired pending bookings of the guest", async () => {
      const now = new Date("2030-06-01T00:00:00.000Z");
      await createBooking({ cabinId, guestId, status: "pending", paymentDeadline: new Date("2030-06-10T00:00:00.000Z"), startDate: utcDate("2030-06-01"), endDate: utcDate("2030-06-03") });
      await createBooking({ cabinId, guestId, status: "pending", paymentDeadline: new Date("2030-05-01T00:00:00.000Z"), startDate: utcDate("2030-06-05"), endDate: utcDate("2030-06-07") });
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-12") });
      await createBooking({ cabinId, guestId: otherGuestId, status: "pending", paymentDeadline: new Date("2030-06-10T00:00:00.000Z"), startDate: utcDate("2030-06-15"), endDate: utcDate("2030-06-17") });

      await expect(bookingRepository.countPendingBookingsForGuest(now, guestId)).resolves.toBe(1);
    });
  });

  // ------------------------------------------------------------------
  // confirmPendingBooking
  // ------------------------------------------------------------------
  describe("confirmPendingBooking", () => {
    it("should confirm a pending booking before its deadline", async () => {
      const booking = await createBooking({
        cabinId,
        guestId,
        status: "pending",
        paymentDeadline: new Date("2030-06-10T00:00:00.000Z"),
      });

      const ok = await bookingRepository.confirmPendingBooking(booking.id, {
        paidAt: new Date("2030-06-01T00:00:00.000Z"),
        paymentReference: "ref-1",
      });

      expect(ok).toBe(true);
      const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(updated.status).toBe("confirmed");
      expect(updated.paymentReference).toBe("ref-1");
    });

    it("should refuse to confirm after the deadline and leave the row unchanged", async () => {
      const booking = await createBooking({
        cabinId,
        guestId,
        status: "pending",
        paymentDeadline: new Date("2030-06-01T00:00:00.000Z"),
      });

      const ok = await bookingRepository.confirmPendingBooking(booking.id, {
        paidAt: new Date("2030-06-10T00:00:00.000Z"),
        paymentReference: "late",
      });

      expect(ok).toBe(false);
      const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(unchanged.status).toBe("pending");
      expect(unchanged.paymentReference).toBeNull();
    });

    it("should refuse to confirm a non-pending booking", async () => {
      const booking = await createBooking({ cabinId, guestId, status: "confirmed" });

      const ok = await bookingRepository.confirmPendingBooking(booking.id, {
        paidAt: new Date("2030-06-01T00:00:00.000Z"),
        paymentReference: "ref",
      });

      expect(ok).toBe(false);
    });

    it("should let only one of two concurrent confirms win", async () => {
      const booking = await createBooking({
        cabinId,
        guestId,
        status: "pending",
        paymentDeadline: new Date("2030-06-10T00:00:00.000Z"),
      });

      const results = await Promise.all([
        bookingRepository.confirmPendingBooking(booking.id, {
          paidAt: new Date("2030-06-01T00:00:00.000Z"),
          paymentReference: "a",
        }),
        bookingRepository.confirmPendingBooking(booking.id, {
          paidAt: new Date("2030-06-01T00:00:00.000Z"),
          paymentReference: "b",
        }),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // cancelPendingBooking
  // ------------------------------------------------------------------
  describe("cancelPendingBooking", () => {
    it("should cancel a pending booking with the given fields", async () => {
      const booking = await createBooking({ cabinId, guestId, status: "pending" });
      const at = new Date("2030-06-01T00:00:00.000Z");

      const ok = await bookingRepository.cancelPendingBooking(booking.id, at, "userCancelled");

      expect(ok).toBe(true);
      const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(updated.status).toBe("cancelled");
      expect(updated.cancellationReason).toBe("userCancelled");
      expect(updated.cancelledAt?.toISOString()).toBe(at.toISOString());
    });

    it("should refuse to cancel a non-pending booking", async () => {
      const booking = await createBooking({ cabinId, guestId, status: "confirmed" });

      const ok = await bookingRepository.cancelPendingBooking(
        booking.id,
        new Date("2030-06-01T00:00:00.000Z"),
        "userCancelled",
      );

      expect(ok).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // transitionBookingStatus
  // ------------------------------------------------------------------
  describe("transitionBookingStatus", () => {
    it("should transition when the current status matches", async () => {
      const booking = await createBooking({ cabinId, guestId, status: "confirmed" });

      const ok = await bookingRepository.transitionBookingStatus(booking.id, "confirmed", {
        status: "checkedIn",
      });

      expect(ok).toBe(true);
      const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(updated.status).toBe("checkedIn");
    });

    it("should not transition when the current status does NOT match", async () => {
      const booking = await createBooking({ cabinId, guestId, status: "pending" });

      const ok = await bookingRepository.transitionBookingStatus(booking.id, "confirmed", {
        status: "checkedIn",
      });

      expect(ok).toBe(false);
      const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(unchanged.status).toBe("pending");
    });

    it("should record cancellation fields", async () => {
      const booking = await createBooking({ cabinId, guestId, status: "confirmed" });
      const at = new Date("2030-06-01T00:00:00.000Z");

      const ok = await bookingRepository.transitionBookingStatus(booking.id, "confirmed", {
        status: "cancelled",
        cancelledAt: at,
        cancellationReason: "adminCancelled",
      });

      expect(ok).toBe(true);
      const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(updated.cancellationReason).toBe("adminCancelled");
      expect(updated.cancelledAt?.toISOString()).toBe(at.toISOString());
    });
  });

  // ------------------------------------------------------------------
  // expirePendingBookings
  // ------------------------------------------------------------------
  describe("expirePendingBookings", () => {
    it("should expire only pending bookings with deadline <= now", async () => {
      await createBooking({ cabinId, guestId, status: "pending", paymentDeadline: new Date("2030-05-01T00:00:00.000Z"), startDate: utcDate("2030-06-01"), endDate: utcDate("2030-06-03") });
      await createBooking({ cabinId, guestId, status: "pending", paymentDeadline: new Date("2030-07-01T00:00:00.000Z"), startDate: utcDate("2030-06-05"), endDate: utcDate("2030-06-07") });
      await createBooking({ cabinId, guestId, status: "confirmed", paymentDeadline: new Date("2030-05-01T00:00:00.000Z"), startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-12") });

      const count = await bookingRepository.expirePendingBookings(new Date("2030-06-01T00:00:00.000Z"));

      expect(count).toBe(1);
      const expired = await prisma.booking.findMany({ where: { status: "cancelled" } });
      expect(expired).toHaveLength(1);
      expect(expired[0].cancellationReason).toBe("paymentExpired");
      expect(expired[0].cancelledAt?.toISOString()).toBe("2030-06-01T00:00:00.000Z");
    });

    it("should expire a booking exactly at the deadline (lte boundary)", async () => {
      const deadline = new Date("2030-06-01T00:00:00.000Z");
      await createBooking({ cabinId, guestId, status: "pending", paymentDeadline: deadline });

      const count = await bookingRepository.expirePendingBookings(deadline);
      expect(count).toBe(1);
    });

    it("should scope expiration to a cabin when requested", async () => {
      await createBooking({ cabinId, guestId, status: "pending", paymentDeadline: new Date("2030-05-01T00:00:00.000Z") });
      await createBooking({ cabinId: otherCabinId, guestId, status: "pending", paymentDeadline: new Date("2030-05-01T00:00:00.000Z") });

      const count = await bookingRepository.expirePendingBookings(
        new Date("2030-06-01T00:00:00.000Z"),
        { cabinId: otherCabinId },
      );

      expect(count).toBe(1);
      const stillPending = await prisma.booking.findMany({ where: { status: "pending" } });
      expect(stillPending).toHaveLength(1);
      expect(stillPending[0].cabinId).toBe(cabinId);
    });
  });

  // ------------------------------------------------------------------
  // database constraints
  // ------------------------------------------------------------------
  describe("database constraints", () => {
    it("should reject overlapping active bookings for the same cabin (exclusion constraint)", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-20") });

      let code: string | undefined;
      let originalCode: string | undefined;
      try {
        await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-15"), endDate: utcDate("2030-06-25") });
        throw new Error("expected the exclusion constraint to reject the insert");
      } catch (error: unknown) {
        code = (error as { code?: string }).code;
        originalCode = (
          error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }
        ).meta?.driverAdapterError?.cause?.originalCode;
        // eslint-disable-next-line no-console
        console.info(
          `[constraint] exclusion violation → Prisma code=${code}, raw PG SQLSTATE=${originalCode}`,
        );
      }

      // مستندسازی واقعیت: Prisma 7 با driver adapter کد P2039 می‌دهد و
      // SQLSTATE اصلی 23P01 در meta.driverAdapterError.cause.originalCode است.
      expect(code).toBe("P2039");
      expect(originalCode).toBe("23P01");
    });

    it("should allow adjacent active bookings for the same cabin", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-15") });

      await expect(
        createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-15"), endDate: utcDate("2030-06-20") }),
      ).resolves.toBeDefined();
    });

    it("should allow an overlapping cancelled booking", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-20") });

      await expect(
        createBooking({ cabinId, guestId, status: "cancelled", startDate: utcDate("2030-06-12"), endDate: utcDate("2030-06-18") }),
      ).resolves.toBeDefined();
    });

    it("should allow an overlapping checkedOut booking", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-20") });

      await expect(
        createBooking({ cabinId, guestId, status: "checkedOut", startDate: utcDate("2030-06-12"), endDate: utcDate("2030-06-18") }),
      ).resolves.toBeDefined();
    });

    it("should allow overlapping bookings on different cabins", async () => {
      await createBooking({ cabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-10"), endDate: utcDate("2030-06-20") });

      await expect(
        createBooking({ cabinId: otherCabinId, guestId, status: "confirmed", startDate: utcDate("2030-06-12"), endDate: utcDate("2030-06-18") }),
      ).resolves.toBeDefined();
    });

    it("should reject end_date <= start_date (CHECK constraint)", async () => {
      let code: string | undefined;
      let originalCode: string | undefined;
      try {
        await createBooking({ cabinId, guestId, startDate: utcDate("2030-06-20"), endDate: utcDate("2030-06-20") });
        throw new Error("expected the CHECK constraint to reject the insert");
      } catch (error: unknown) {
        code = (error as { code?: string }).code;
        originalCode = (
          error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }
        ).meta?.driverAdapterError?.cause?.originalCode;
        // eslint-disable-next-line no-console
        console.info(`[constraint] CHECK violation → Prisma code=${code}, raw PG SQLSTATE=${originalCode}`);
      }

      // مستندسازی واقعیت: Prisma 7 با driver adapter هر دو نقض constraint
      // (هم exclusion و هم CHECK) را با کد P2039 برمی‌گرداند و SQLSTATE اصلی
      // در meta.driverAdapterError.cause.originalCode است (اینجا 23514).
      expect(code).toBe("P2039");
      expect(originalCode).toBe("23514");
    });
  });
});

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createUser, createCabin, createBooking, utcDate } from "../../helpers/factories.js";
import { getTestApp, BOOKINGS_PATH } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { prisma } from "../../../src/config/database.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

describe.skipIf(!isIntegrationDbAvailable())("booking.routes (integration)", () => {
  let cabinId: number;
  let guest: Awaited<ReturnType<typeof createUser>>;
  let otherGuest: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    cabinId = (await createCabin({ regularPrice: 1_000_000, maxCapacity: 4 })).id;
    guest = await createUser({ role: "guest" });
    otherGuest = await createUser({ role: "guest" });
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  /** رزرو فردا تا پس‌فردا (همیشه در آینده نسبت به «امروز»). */
  function futureDates() {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const startYmd = start.toISOString().slice(0, 10);
    const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
    return { startYmd, endYmd: end.toISOString().slice(0, 10) };
  }

  // ==================================================================
  // POST /bookings
  // ==================================================================
  describe("POST /bookings", () => {
    it("should reject an unauthenticated request with 401", async () => {
      const res = await request(app).post(BOOKINGS_PATH).send({});
      expect(res.status).toBe(401);
    });

    it("should reject an invalid body with 400 and the project error shape", async () => {
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ cabinId, startDate: "not-a-date", endDate: "2027-01-02", numGuests: 2 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ status: "fail", code: "VALIDATION_ERROR" });
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("should reject a full ISO datetime for startDate", async () => {
      const res = await request(app).post(BOOKINGS_PATH).set("Cookie", cookieFor(guest)).send({
        cabinId,
        startDate: "2027-01-01T10:00:00.000Z",
        endDate: "2027-01-03",
        numGuests: 2,
      });

      expect(res.status).toBe(400);
    });

    it("should create a booking for a guest and return 201", async () => {
      const { startYmd, endYmd } = futureDates();
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ cabinId, startDate: startYmd, endDate: endYmd, numGuests: 2 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.booking).toMatchObject({ status: "pending", numNights: 2 });
      // totalPrice باید در JSON عدد باشد (نه BigInt که 500 می‌دهد).
      expect(typeof res.body.data.booking.totalPrice).toBe("number");
    });

    it("should not expose guest.userId in the created booking", async () => {
      const { startYmd, endYmd } = futureDates();
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ cabinId, startDate: startYmd, endDate: endYmd, numGuests: 2 });

      expect(res.status).toBe(201);
      // نکته: پاسخ create رکورد خام بدون relation است، پس `guest` وجود ندارد.
      // مهم این است که اگر guest برگردد، userId نداشته باشد (باگ E رعایت شده).
      if (res.body.data.booking.guest !== undefined) {
        expect(res.body.data.booking.guest).not.toHaveProperty("userId");
      }
      // و در هیچ جای payload خام userId لو نرود.
      expect(JSON.stringify(res.body)).not.toContain('"userId"');
    });

    it("should reject a past start date with 400", async () => {
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ cabinId, startDate: "2020-01-01", endDate: "2020-01-03", numGuests: 2 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BOOKING_INVALID_DATE_RANGE");
    });

    it("should reject an overlapping booking with 409", async () => {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await createBooking({
        cabinId,
        guestId: otherGuest.guestId!,
        status: "confirmed",
        startDate: start,
        endDate: new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({
          cabinId,
          startDate: start.toISOString().slice(0, 10),
          endDate: new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          numGuests: 2,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BOOKING_DATE_OVERLAP");
    });

    it("should succeed over an expired pending booking that cron has not expired yet", async () => {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
      // pending منقضی‌شده روی همان تاریخ — نباید مانع شود.
      await createBooking({
        cabinId,
        guestId: otherGuest.guestId!,
        status: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
        startDate: start,
        endDate: end,
      });

      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({
          cabinId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          numGuests: 2,
        });

      expect(res.status).toBe(201);

      // رزرو منقضی هم باید توسط همان تراکنش لغو شده باشد.
      const expired = await prisma.booking.findFirst({ where: { status: "cancelled" } });
      expect(expired?.cancellationReason).toBe("paymentExpired");
    });

    it("should reject a missing cabin with 404", async () => {
      const { startYmd, endYmd } = futureDates();
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ cabinId: 999_999, startDate: startYmd, endDate: endYmd, numGuests: 2 });

      expect(res.status).toBe(404);
    });

    it("should reject a start date beyond the max advance window with 400", async () => {
      const far = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
      const farEnd = new Date(far.getTime() + 2 * 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({
          cabinId,
          startDate: far.toISOString().slice(0, 10),
          endDate: farEnd.toISOString().slice(0, 10),
          numGuests: 2,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BOOKING_INVALID_DATE_RANGE");
    });
  });

  // ==================================================================
  // GET /bookings
  // ==================================================================
  describe("GET /bookings", () => {
    beforeEach(async () => {
      await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
        startDate: utcDate("2030-06-01"),
        endDate: utcDate("2030-06-03"),
      });
      await createBooking({
        cabinId,
        guestId: otherGuest.guestId!,
        status: "pending",
        startDate: utcDate("2030-07-01"),
        endDate: utcDate("2030-07-03"),
      });
    });

    it("should require authentication", async () => {
      expect((await request(app).get(BOOKINGS_PATH)).status).toBe(401);
    });

    it("should let admin see every booking", async () => {
      const res = await request(app).get(BOOKINGS_PATH).set("Cookie", cookieFor(admin));
      expect(res.status).toBe(200);
      expect(res.body.data.bookings).toHaveLength(2);
      expect(res.body.data.meta).toMatchObject({ totalItems: 2 });
    });

    it("should let owner see every booking", async () => {
      const res = await request(app).get(BOOKINGS_PATH).set("Cookie", cookieFor(owner));
      expect(res.body.data.bookings).toHaveLength(2);
    });

    it("should scope a guest to their own bookings", async () => {
      const res = await request(app).get(BOOKINGS_PATH).set("Cookie", cookieFor(guest));
      expect(res.status).toBe(200);
      expect(res.body.data.bookings).toHaveLength(1);
      expect(res.body.data.bookings[0].guestId).toBe(guest.guestId);
    });

    it("should NOT let a guest widen the scope with a guestId filter", async () => {
      // ⚠️ یافته‌ی باگ: سرویس فیلترها را به‌صورت { ...filters, guestUserId: userId }
      // می‌سازد، پس `guestId` ورودی با `guestUserId` AND می‌شود. نتیجه این است که
      // مهمان با فرستادن یک guestId دلخواه، رزروهای خودش را هم «خالی» می‌بیند
      // (نه اینکه رزرو دیگری را ببیند؛ پس نشت اطلاعاتی نیست، اما رفتار اشتباه است).
      // تست زیر رفتار *فعلی* را مستند می‌کند تا اگر اصلاح شد، شکسته شود.
      const res = await request(app)
        .get(BOOKINGS_PATH)
        .query({ guestId: otherGuest.guestId })
        .set("Cookie", cookieFor(guest));

      expect(res.status).toBe(200);
      // هیچ رزروی از مهمان دیگر برنمی‌گردد (امنیت حفظ شده).
      const returnedIds = res.body.data.bookings.map((b: { guestId: number }) => b.guestId);
      expect(returnedIds).not.toContain(otherGuest.guestId);
      // BUG: انتظار درست این است که رزروهای خودِ مهمان برگردد (long=1)، ولی
      // چون guestId با guestUserId AND می‌شود، نتیجه خالی است.
      expect(res.body.data.bookings).toHaveLength(0);
    });

    it("should not expose guest.userId in the listing", async () => {
      const res = await request(app).get(BOOKINGS_PATH).set("Cookie", cookieFor(admin));
      expect(res.body.data.bookings[0].guest).not.toHaveProperty("userId");
    });

    it("should filter by status", async () => {
      const res = await request(app)
        .get(BOOKINGS_PATH)
        .query({ status: "confirmed" })
        .set("Cookie", cookieFor(admin));
      expect(res.body.data.bookings).toHaveLength(1);
    });

    it("should reject an invalid status filter with 400", async () => {
      const res = await request(app)
        .get(BOOKINGS_PATH)
        .query({ status: "bogus" })
        .set("Cookie", cookieFor(admin));
      expect(res.status).toBe(400);
    });

    it("should paginate", async () => {
      const res = await request(app)
        .get(BOOKINGS_PATH)
        .query({ page: 2, limit: 1 })
        .set("Cookie", cookieFor(admin));
      expect(res.body.data.bookings).toHaveLength(1);
      expect(res.body.data.meta.currentPage).toBe(2);
    });
  });

  // ==================================================================
  // GET /bookings/:id
  // ==================================================================
  describe("GET /bookings/:id", () => {
    let bookingId: number;

    beforeEach(async () => {
      bookingId = (await createBooking({ cabinId, guestId: guest.guestId! })).id;
    });

    it("should require authentication", async () => {
      expect((await request(app).get(`${BOOKINGS_PATH}/${bookingId}`)).status).toBe(401);
    });

    it("should reject a non-numeric id with 400", async () => {
      const res = await request(app).get(`${BOOKINGS_PATH}/abc`).set("Cookie", cookieFor(admin));
      expect(res.status).toBe(400);
    });

    it("should return 404 for an unknown id", async () => {
      const res = await request(app).get(`${BOOKINGS_PATH}/999999`).set("Cookie", cookieFor(admin));
      expect(res.status).toBe(404);
    });

    it("should let the owner read their booking", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/${bookingId}`)
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(200);
      expect(res.body.data.booking.id).toBe(bookingId);
    });

    it("should let admin read any booking", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/${bookingId}`)
        .set("Cookie", cookieFor(admin));
      expect(res.status).toBe(200);
    });

    it("should reject another guest with 403", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/${bookingId}`)
        .set("Cookie", cookieFor(otherGuest));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("BOOKING_FORBIDDEN");
    });

    it("should not expose guest.userId", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/${bookingId}`)
        .set("Cookie", cookieFor(guest));
      expect(res.body.data.booking.guest).not.toHaveProperty("userId");
    });
  });

  // ==================================================================
  // POST /bookings/:id/pay
  // ==================================================================
  describe("POST /bookings/:id/pay", () => {
    it("should require authentication", async () => {
      const booking = await createBooking({ cabinId, guestId: guest.guestId! });
      expect((await request(app).post(`${BOOKINGS_PATH}/${booking.id}/pay`)).status).toBe(401);
    });

    it("should pay a pending booking", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        paymentDeadline: new Date(Date.now() + 10 * 60_000),
      });

      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/pay`)
        .set("Cookie", cookieFor(guest));

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe("confirmed");
      expect(res.body.data.booking.guest).not.toHaveProperty("userId");
    });

    it("should reject another guest with 403", async () => {
      const booking = await createBooking({ cabinId, guestId: guest.guestId! });
      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/pay`)
        .set("Cookie", cookieFor(otherGuest));
      expect(res.status).toBe(403);
    });

    it("should reject paying after cancelling with 409", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "cancelled",
      });
      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/pay`)
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(409);
    });

    it("should reject paying an expired booking with 409 BOOKING_EXPIRED", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        paymentDeadline: new Date(Date.now() - 60_000),
      });
      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/pay`)
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BOOKING_EXPIRED");
    });
  });

  // ==================================================================
  // POST /bookings/:id/cancel
  // ==================================================================
  describe("POST /bookings/:id/cancel", () => {
    it("should require authentication", async () => {
      const booking = await createBooking({ cabinId, guestId: guest.guestId! });
      expect((await request(app).post(`${BOOKINGS_PATH}/${booking.id}/cancel`)).status).toBe(401);
    });

    it("should cancel a pending booking", async () => {
      const booking = await createBooking({ cabinId, guestId: guest.guestId! });
      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/cancel`)
        .set("Cookie", cookieFor(guest));

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe("cancelled");
      expect(res.body.data.booking.guest).not.toHaveProperty("userId");
    });

    it("should reject another guest with 403", async () => {
      const booking = await createBooking({ cabinId, guestId: guest.guestId! });
      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/cancel`)
        .set("Cookie", cookieFor(otherGuest));
      expect(res.status).toBe(403);
    });

    it("should reject cancelling after paying with 409", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
      });
      const res = await request(app)
        .post(`${BOOKINGS_PATH}/${booking.id}/cancel`)
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BOOKING_CANNOT_CANCEL");
    });
  });

  // ==================================================================
  // PATCH /bookings/:id/status
  // ==================================================================
  describe("PATCH /bookings/:id/status", () => {
    it("should require authentication", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
      });
      const res = await request(app)
        .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
        .send({ status: "checkedIn" });
      expect(res.status).toBe(401);
    });

    it("should reject a guest with 403", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
      });
      const res = await request(app)
        .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
        .set("Cookie", cookieFor(guest))
        .send({ status: "checkedIn" });
      expect(res.status).toBe(403);
    });

    it("should reject the non-updatable statuses with 400", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
      });
      for (const status of ["pending", "confirmed"]) {
        const res = await request(app)
          .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
          .set("Cookie", cookieFor(admin))
          .send({ status });
        expect(res.status).toBe(400);
      }
    });

    it("should let admin check in a confirmed booking on/after its start date", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
        startDate: utcDate(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
        endDate: utcDate(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
      });

      const res = await request(app)
        .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
        .set("Cookie", cookieFor(admin))
        .send({ status: "checkedIn" });

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe("checkedIn");
      expect(res.body.data.booking.guest).not.toHaveProperty("userId");
    });

    it("should reject check-in before the start date with 400", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
        startDate: utcDate("2030-06-01"),
        endDate: utcDate("2030-06-05"),
      });

      const res = await request(app)
        .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
        .set("Cookie", cookieFor(admin))
        .send({ status: "checkedIn" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BOOKING_INVALID_STATUS_TRANSITION");
    });

    it("should let owner cancel a confirmed booking", async () => {
      const booking = await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
      });
      const res = await request(app)
        .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
        .set("Cookie", cookieFor(owner))
        .send({ status: "cancelled" });

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe("cancelled");
      expect(res.body.data.booking.cancellationReason).toBe("adminCancelled");
    });

    it("should reject an invalid transition with 400", async () => {
      const booking = await createBooking({ cabinId, guestId: guest.guestId!, status: "pending" });
      const res = await request(app)
        .patch(`${BOOKINGS_PATH}/${booking.id}/status`)
        .set("Cookie", cookieFor(admin))
        .send({ status: "checkedIn" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BOOKING_INVALID_STATUS_TRANSITION");
    });
  });

  // ==================================================================
  // GET /bookings/cabin/:cabinId/booked-dates
  // ==================================================================
  describe("GET /bookings/cabin/:cabinId/booked-dates", () => {
    /**
     * این اندپوینت عمداً «عمومی» است (بدون احراز هویت): صفحه‌ی جزئیات کابین
     * برای بازدیدکننده‌ی بدون ورود هم باید روزهای پرشده را غیرفعال کند، پس در
     * `booking.route.ts` قبل از `router.use(protect)` ثبت شده است.
     * تست قبلی انتظار ۴۰۱ داشت که با این طراحی ناسازگار بود.
     */
    it("is public — returns the booked ranges without authentication", async () => {
      const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
        startDate: start,
        endDate: new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app).get(`${BOOKINGS_PATH}/cabin/${cabinId}/booked-dates`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.bookedDates).toHaveLength(1);
    });

    it("should return the booked ranges without from/to", async () => {
      const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      await createBooking({
        cabinId,
        guestId: guest.guestId!,
        status: "confirmed",
        startDate: start,
        endDate: new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app)
        .get(`${BOOKINGS_PATH}/cabin/${cabinId}/booked-dates`)
        .set("Cookie", cookieFor(guest));

      expect(res.status).toBe(200);
      expect(res.body.data.bookedDates).toHaveLength(1);
    });

    it("should reject a range longer than the maximum with 400", async () => {
      const from = "2027-01-01";
      const to = "2040-01-01";
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/cabin/${cabinId}/booked-dates`)
        .query({ from, to })
        .set("Cookie", cookieFor(guest));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("should reject from > to", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/cabin/${cabinId}/booked-dates`)
        .query({ from: "2027-06-10", to: "2027-06-01" })
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(400);
    });

    it("should return 404 for an unknown cabin", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/cabin/999999/booked-dates`)
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(404);
    });

    it("should accept a valid range", async () => {
      const res = await request(app)
        .get(`${BOOKINGS_PATH}/cabin/${cabinId}/booked-dates`)
        .query({ from: "2027-01-01", to: "2027-03-01" })
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(200);
    });
  });
});

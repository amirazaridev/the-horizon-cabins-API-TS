import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createCabin, createUser } from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { prisma } from "../../../src/config/database.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const SETTINGS_PATH = `${API_BASE}/settings`;
const BOOKINGS_PATH = `${API_BASE}/bookings`;

const TODAY = () => todayInTimezone(TIMEZONE);
const ymd = (date: Date) => date.toISOString().slice(0, 10);

describe.skipIf(!isIntegrationDbAvailable())("setting.routes (integration)", () => {
  let guest: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    guest = await createUser({ role: "guest" });
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  // ==================================================================
  // Permissions
  // ==================================================================
  describe("permissions", () => {
    it("GET /settings requires auth (401) and admin|owner (403 for guest)", async () => {
      expect((await request(app).get(SETTINGS_PATH)).status).toBe(401);
      expect((await request(app).get(SETTINGS_PATH).set("Cookie", cookieFor(guest))).status).toBe(
        403,
      );
      expect((await request(app).get(SETTINGS_PATH).set("Cookie", cookieFor(admin))).status).toBe(
        200,
      );
      expect((await request(app).get(SETTINGS_PATH).set("Cookie", cookieFor(owner))).status).toBe(
        200,
      );
    });

    it("PATCH /settings is owner only (admin gets 403)", async () => {
      expect((await request(app).patch(SETTINGS_PATH).send({ maxGuests: 8 })).status).toBe(401);
      expect(
        (
          await request(app)
            .patch(SETTINGS_PATH)
            .set("Cookie", cookieFor(guest))
            .send({ maxGuests: 8 })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .patch(SETTINGS_PATH)
            .set("Cookie", cookieFor(admin))
            .send({ maxGuests: 8 })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .patch(SETTINGS_PATH)
            .set("Cookie", cookieFor(owner))
            .send({ maxGuests: 9 })
        ).status,
      ).toBe(200);
    });
  });

  // ==================================================================
  // Read
  // ==================================================================
  describe("GET", () => {
    it("creates the singleton row with defaults and returns it with derived values", async () => {
      const res = await request(app).get(SETTINGS_PATH).set("Cookie", cookieFor(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.settings).toMatchObject({
        maxBookingLength: 30,
        maxAdvanceBookingDays: 120,
        priceCalendarHorizonDays: 120,
        bookedDatesMaxRangeDays: 121,
      });

      expect(await prisma.setting.count()).toBe(1);
    });
  });

  // ==================================================================
  // Update
  // ==================================================================
  describe("PATCH", () => {
    it("persists a partial update and reflects it on the next GET", async () => {
      await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ maxBookingLength: 20, paymentDeadlineMinutes: 45 })
        .expect(200);

      const res = await request(app).get(SETTINGS_PATH).set("Cookie", cookieFor(admin));
      expect(res.body.data.settings).toMatchObject({
        maxBookingLength: 20,
        paymentDeadlineMinutes: 45,
      });

      const row = await prisma.setting.findFirst();
      expect(row).toMatchObject({ maxBookingLength: 20, paymentDeadlineMinutes: 45 });
    });

    it("rejects an empty body", async () => {
      const res = await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({});
      expect(res.status).toBe(400);
    });

    it("rejects unknown keys (strict)", async () => {
      const res = await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ breakfastPrice: 10 });
      expect(res.status).toBe(400);
    });

    it("rejects an inconsistent combination with 400 SETTINGS_INVALID", async () => {
      // min=31 از اعتبارسنجی فیلد می‌گذرد ولی با max=30 ناسازگار است.
      const res = await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ minBookingLength: 31 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("SETTINGS_INVALID");
    });
  });

  // ==================================================================
  // Runtime wiring — the setting actually changes behaviour
  // ==================================================================
  describe("runtime wiring", () => {
    it("applies a new maxBookingLength to booking validation", async () => {
      const cabin = await createCabin({ regularPrice: 1_000_000 });

      await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ maxBookingLength: 1 })
        .expect(200);

      const start = addDaysUtc(TODAY(), 1);
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guest))
        .send({
          cabinId: cabin.id,
          startDate: ymd(start),
          endDate: ymd(addDaysUtc(start, 2)),
          numGuests: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BOOKING_INVALID_DATE_RANGE");
    });

    it("rebuilds cabin price calendars when a pricing-affecting setting changes", async () => {
      const cabin = await createCabin({ regularPrice: 1_000_000 });
      expect(await prisma.cabinDailyPrice.count({ where: { cabinId: cabin.id } })).toBe(0);

      const res = await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ maxTotalDiscountPercent: 40 });

      expect(res.status).toBe(200);
      // پنجره‌ی تقویم ۱۲۰ روز است → ۱۲۰ ردیف برای تنها کابین.
      expect(res.body.data.calendarRowsRebuilt).toBe(120);
      expect(await prisma.cabinDailyPrice.count({ where: { cabinId: cabin.id } })).toBe(120);
    });

    it("does not rebuild when only a non-pricing setting changes", async () => {
      await createCabin({ regularPrice: 1_000_000 });

      const res = await request(app)
        .patch(SETTINGS_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ maxGuests: 12 });

      expect(res.status).toBe(200);
      expect(res.body.data.calendarRowsRebuilt).toBeUndefined();
      expect(await prisma.cabinDailyPrice.count()).toBe(0);
    });
  });
});

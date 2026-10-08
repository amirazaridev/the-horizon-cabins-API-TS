import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createCabin, createPriceRule, createUser, utcDate } from "../../helpers/factories.js";
import { getTestApp, API_BASE, BOOKINGS_PATH } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { prisma } from "../../../src/config/database.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe.skipIf(!isIntegrationDbAvailable())("booking pricing (integration)", () => {
  let cabinId: number;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let guestUser: Awaited<ReturnType<typeof createUser>>;
  const today = () => todayInTimezone(TIMEZONE);

  beforeEach(async () => {
    await resetDatabase();
    cabinId = (await createCabin({ regularPrice: 1_000_000 })).id;
    owner = await createUser({ role: "owner", withGuest: false });
    guestUser = await createUser({ role: "guest", withGuest: true });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  const quotePath = () => `${API_BASE}/cabins/${cabinId}/price-quote`;

  describe("GET /cabins/:cabinId/price-quote", () => {
    it("is public and returns a per-night breakdown with no rules", async () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 5);

      const res = await request(app).get(
        `${quotePath()}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );

      expect(res.status).toBe(200);
      const quote = res.body.data.quote;
      expect(quote.nights).toHaveLength(3);
      expect(quote.totalPrice).toBe(3_000_000);
      expect(quote.available).toBe(true);
      expect(quote.nights[0].finalPrice).toBe(1_000_000);
    });

    it("applies active rules via the engine", async () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 4);

      await createPriceRule({
        cabinId,
        actorId: owner.id,
        type: "discount",
        kind: "dateRange",
        percent: 20,
        startDate: start,
        endDate: addDaysUtc(start, 5),
      });

      const res = await request(app).get(
        `${quotePath()}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.quote.nights[0].finalPrice).toBe(800_000);
      expect(res.body.data.quote.totalPrice).toBe(1_600_000);
    });

    it("reports unavailable when an occupying booking overlaps", async () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 5);

      await prisma.booking.create({
        data: {
          startDate: start,
          endDate: end,
          numNights: 3,
          numGuests: 2,
          cabinPrice: 3_000_000,
          totalPrice: 3_000_000,
          status: "confirmed",
          paymentDeadline: new Date(Date.now() + 3_600_000),
          cabinId,
          guestId: guestUser.guestId!,
        },
      });

      const res = await request(app).get(
        `${quotePath()}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.quote.available).toBe(false);
    });

    it("rejects a range beyond the 120-day horizon", async () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 125);

      const res = await request(app).get(
        `${quotePath()}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("BOOKING_INVALID_DATE_RANGE");
    });

    it("returns 404 for an unknown cabin", async () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 5);
      const res = await request(app).get(
        `${API_BASE}/cabins/999999/price-quote?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /bookings — immutable per-night snapshot", () => {
    const createBody = () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 5);
      return { cabinId, startDate: ymd(start), endDate: ymd(end), numGuests: 2 };
    };

    it("stores cabinPrice as the stay subtotal and writes one row per night", async () => {
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send(createBody());

      expect(res.status).toBe(201);
      const booking = res.body.data.booking;
      expect(booking.cabinPrice).toBe(3_000_000);
      expect(booking.totalPrice).toBe(3_000_000);
      expect(booking.nights).toHaveLength(3);

      const nights = await prisma.bookingNight.count({ where: { bookingId: booking.id } });
      expect(nights).toBe(3);
    });

    it("applies active rules and snapshots them in appliedRules", async () => {
      const start = addDaysUtc(today(), 2);
      const end = addDaysUtc(today(), 5);

      await createPriceRule({
        cabinId,
        actorId: owner.id,
        type: "surcharge",
        kind: "dateRange",
        percent: 25,
        startDate: start,
        endDate: addDaysUtc(start, 5),
        label: "Holiday",
      });

      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send({ ...createBody(), startDate: ymd(start), endDate: ymd(end) });

      expect(res.status).toBe(201);
      expect(res.body.data.booking.totalPrice).toBe(3_750_000);
      const firstNight = res.body.data.booking.nights[0];
      expect(firstNight.surchargePercent).toBe(25);
      expect(firstNight.finalPrice).toBe(1_250_000);
      expect(firstNight.appliedRules).toHaveLength(1);
    });

    it("returns 409 PRICE_CHANGED when expectedTotalPrice does not match", async () => {
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send({ ...createBody(), expectedTotalPrice: 1 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PRICE_CHANGED");
      expect(res.body.errors.totalPrice).toBe(3_000_000);
    });

    it("accepts a matching expectedTotalPrice", async () => {
      const res = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send({ ...createBody(), expectedTotalPrice: 3_000_000 });

      expect(res.status).toBe(201);
    });

    it("does not retroactively change an existing booking when a rule is added later", async () => {
      const create = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send(createBody());
      const bookingId = create.body.data.booking.id;

      const start = addDaysUtc(today(), 2);
      await createPriceRule({
        cabinId,
        actorId: owner.id,
        type: "surcharge",
        kind: "dateRange",
        percent: 50,
        startDate: start,
        endDate: addDaysUtc(start, 5),
      });

      const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(after.totalPrice).toBe(3_000_000);

      const nights = await prisma.bookingNight.findMany({ where: { bookingId } });
      expect(nights.every((night) => night.finalPrice === 1_000_000)).toBe(true);
    });

    it("accepts endDate exactly at today+120 and rejects today+121", async () => {
      const okEnd = addDaysUtc(today(), 120);
      const ok = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send({
          cabinId,
          startDate: ymd(addDaysUtc(okEnd, -1)),
          endDate: ymd(okEnd),
          numGuests: 2,
        });
      expect(ok.status).toBe(201);

      const badEnd = addDaysUtc(today(), 121);
      const bad = await request(app)
        .post(BOOKINGS_PATH)
        .set("Cookie", cookieFor(guestUser))
        .send({
          cabinId,
          startDate: ymd(addDaysUtc(badEnd, -1)),
          endDate: ymd(badEnd),
          numGuests: 2,
        });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("BOOKING_INVALID_DATE_RANGE");
    });
  });
});

void utcDate;

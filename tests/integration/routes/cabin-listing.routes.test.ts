import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import {
  createCabin,
  createCabinDailyPrice,
  createBooking,
  createUser,
  createPriceRule,
} from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { prisma } from "../../../src/config/database.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";
import { PRICING_LIMITS } from "../../../src/constants/pricing.constants.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const CABINS_PATH = `${API_BASE}/cabins`;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * یک کابین با تقویم قیمت ثابت می‌سازد: هر شب از پنجره‌ی ما `nightlyPrice` است.
 * برای تست‌های لیست، تاریخ شروع اقامت را داخل پنجره می‌گذاریم.
 */
async function cabinWithFlatPrice(nightlyPrice: number) {
  const cabin = await createCabin({ regularPrice: nightlyPrice });
  const today = todayInTimezone(TIMEZONE);
  const rows = [];
  for (let i = 0; i < PRICING_LIMITS.priceCalendarHorizonDays; i += 1) {
    rows.push({ date: addDaysUtc(today, i), price: nightlyPrice });
  }
  for (const row of rows) {
    await createCabinDailyPrice({
      cabinId: cabin.id,
      date: row.date,
      basePrice: nightlyPrice,
      finalPrice: row.price,
    });
  }
  return cabin;
}

describe.skipIf(!isIntegrationDbAvailable())("cabin listing pricing (integration)", () => {
  const today = () => todayInTimezone(TIMEZONE);

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  describe("without dates", () => {
    it("returns a startingFrom pricing object and keeps the existing pagination envelope", async () => {
      const cabin = await cabinWithFlatPrice(2_000_000);

      const res = await request(app).get(CABINS_PATH);

      expect(res.status).toBe(200);
      expect(res.body.data.meta).toMatchObject({ currentPage: 1 });
      const found = res.body.data.cabins.find((c: { id: number }) => c.id === cabin.id);
      expect(found.pricing).toEqual({
        mode: "startingFrom",
        startingPrice: 2_000_000,
        windowDays: PRICING_LIMITS.startingPriceWindowDays,
      });
      expect(found).not.toHaveProperty("discount");
    });

    it("filters on startingPrice with price=min-max", async () => {
      const cheap = await cabinWithFlatPrice(1_000_000);
      const pricey = await cabinWithFlatPrice(5_000_000);

      const res = await request(app).get(`${CABINS_PATH}?price=900000-1500000`);

      const ids = res.body.data.cabins.map((c: { id: number }) => c.id);
      expect(ids).toContain(cheap.id);
      expect(ids).not.toContain(pricey.id);
    });

    it("sorts by price ascending and descending (nulls last)", async () => {
      const a = await cabinWithFlatPrice(3_000_000);
      const b = await cabinWithFlatPrice(1_000_000);
      const c = await cabinWithFlatPrice(2_000_000);

      const asc = await request(app).get(`${CABINS_PATH}?sort=price_asc`);
      const ascIds = asc.body.data.cabins.map((x: { id: number }) => x.id);
      expect(ascIds.indexOf(b.id)).toBeLessThan(ascIds.indexOf(c.id));
      expect(ascIds.indexOf(c.id)).toBeLessThan(ascIds.indexOf(a.id));

      const desc = await request(app).get(`${CABINS_PATH}?sort=price_desc`);
      const descIds = desc.body.data.cabins.map((x: { id: number }) => x.id);
      expect(descIds.indexOf(a.id)).toBeLessThan(descIds.indexOf(c.id));
      expect(descIds.indexOf(c.id)).toBeLessThan(descIds.indexOf(b.id));
    });

    it("excludes cabins with no calendar rows when a price filter is present", async () => {
      const noCalendar = await createCabin({ regularPrice: 2_000_000 });

      const res = await request(app).get(`${CABINS_PATH}?price=1000000-3000000`);

      const ids = res.body.data.cabins.map((c: { id: number }) => c.id);
      expect(ids).not.toContain(noCalendar.id);
    });

    it("returns 400 when totalPrice is used without dates", async () => {
      const res = await request(app).get(`${CABINS_PATH}?totalPrice=1000000-2000000`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("with dates", () => {
    const stay = () => {
      const start = addDaysUtc(today(), 5);
      const end = addDaysUtc(today(), 8); // 3 nights
      return { start, end };
    };

    it("returns a stay pricing object with totalPrice and avgNightlyPrice", async () => {
      const cabin = await cabinWithFlatPrice(1_000_000);
      const { start, end } = stay();

      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );

      expect(res.status).toBe(200);
      const found = res.body.data.cabins.find((c: { id: number }) => c.id === cabin.id);
      expect(found.pricing).toEqual({
        mode: "stay",
        nights: 3,
        totalPrice: 3_000_000,
        avgNightlyPrice: 1_000_000,
      });
    });

    it("excludes cabins missing a row for any night of the stay", async () => {
      const full = await cabinWithFlatPrice(1_000_000);
      const partial = await createCabin({ regularPrice: 1_000_000 });
      // فقط یک شب از اقامت را پر می‌کنیم.
      const { start } = stay();
      await createCabinDailyPrice({
        cabinId: partial.id,
        date: start,
        basePrice: 1_000_000,
        finalPrice: 1_000_000,
      });

      const { end } = stay();
      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );

      const ids = res.body.data.cabins.map((c: { id: number }) => c.id);
      expect(ids).toContain(full.id);
      expect(ids).not.toContain(partial.id);
    });

    it("filters by average nightly price using integer math", async () => {
      const cabin = await cabinWithFlatPrice(1_000_000);
      const { start, end } = stay();

      // میانگین ۱٬۰۰۰٬۰۰۰ → داخل ۹۰۰٬۰۰۰..۱٬۱۰۰٬۰۰۰
      const inside = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&price=900000-1100000`,
      );
      expect(inside.body.data.cabins.map((c: { id: number }) => c.id)).toContain(cabin.id);

      const outside = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&price=2000000-3000000`,
      );
      expect(outside.body.data.cabins.map((c: { id: number }) => c.id)).not.toContain(cabin.id);
    });

    it("filters by total bill with totalPrice=min-max (inclusive)", async () => {
      const cabin = await cabinWithFlatPrice(1_000_000);
      const { start, end } = stay();

      const inclusive = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&totalPrice=3000000-3000000`,
      );
      expect(inclusive.body.data.cabins.map((c: { id: number }) => c.id)).toContain(cabin.id);

      const tooSmall = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&totalPrice=1000000-2999999`,
      );
      expect(tooSmall.body.data.cabins.map((c: { id: number }) => c.id)).not.toContain(cabin.id);
    });

    it("sorts by total price with a stable cabin.id tie-breaker", async () => {
      const a = await cabinWithFlatPrice(2_000_000);
      const b = await cabinWithFlatPrice(1_000_000);
      const { start, end } = stay();

      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&sort=price_asc`,
      );
      const ids = res.body.data.cabins.map((c: { id: number }) => c.id);
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    });

    it("excludes cabins with an occupying booking (confirmed)", async () => {
      const cabin = await cabinWithFlatPrice(1_000_000);
      const guest = await createUser({ role: "guest", withGuest: true });
      const { start, end } = stay();

      await createBooking({
        cabinId: cabin.id,
        guestId: guest.guestId!,
        startDate: start,
        endDate: end,
        status: "confirmed",
      });

      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );
      expect(res.body.data.cabins.map((c: { id: number }) => c.id)).not.toContain(cabin.id);
    });

    it("does NOT block on an expired pending booking", async () => {
      const cabin = await cabinWithFlatPrice(1_000_000);
      const guest = await createUser({ role: "guest", withGuest: true });
      const { start, end } = stay();

      await createBooking({
        cabinId: cabin.id,
        guestId: guest.guestId!,
        startDate: start,
        endDate: end,
        status: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      });

      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );
      expect(res.body.data.cabins.map((c: { id: number }) => c.id)).toContain(cabin.id);
    });

    it("returns 400 when only one of startDate/endDate is provided", async () => {
      const { start } = stay();
      const res = await request(app).get(`${CABINS_PATH}?startDate=${ymd(start)}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when price and totalPrice are combined", async () => {
      const { start, end } = stay();
      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&price=1-2&totalPrice=3-4`,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when endDate is beyond the 120-day horizon", async () => {
      const start = addDaysUtc(today(), 5);
      const end = addDaysUtc(today(), 130);
      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}`,
      );
      expect(res.status).toBe(400);
    });

    it("reports the correct pagination meta under filters", async () => {
      await cabinWithFlatPrice(1_000_000);
      await cabinWithFlatPrice(1_000_000);
      await cabinWithFlatPrice(9_000_000);
      const { start, end } = stay();

      const res = await request(app).get(
        `${CABINS_PATH}?startDate=${ymd(start)}&endDate=${ymd(end)}&price=900000-1100000&limit=1`,
      );
      expect(res.body.data.cabins).toHaveLength(1);
      expect(res.body.data.meta.totalItems).toBe(2);
      expect(res.body.data.meta.totalPages).toBe(2);
    });
  });

  describe("existing behaviour preserved", () => {
    it("keeps the no-parameter path working and enriches it with pricing", async () => {
      await cabinWithFlatPrice(1_500_000);
      const res = await request(app).get(CABINS_PATH);
      expect(res.status).toBe(200);
      expect(res.body.data.cabins.length).toBeGreaterThan(0);
      expect(res.body.data.cabins[0].pricing.mode).toBe("startingFrom");
    });

    it("still supports guests/bedrooms/amenities filters", async () => {
      const cabin = await createCabin({ maxCapacity: 6 });
      await createPriceRule({
        cabinId: cabin.id,
        actorId: (await createUser({ role: "owner", withGuest: false })).id,
        percent: 10,
      });
      const res = await request(app).get(`${CABINS_PATH}?guests=5&bedrooms=1`);
      expect(res.status).toBe(200);
      expect(res.body.data.cabins.map((c: { id: number }) => c.id)).toContain(cabin.id);
    });
  });
});

void prisma;

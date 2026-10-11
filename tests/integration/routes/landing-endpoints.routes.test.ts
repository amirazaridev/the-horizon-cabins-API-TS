import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import {
  createBooking,
  createCabin,
  createCabinDailyPrice,
  createCity,
  createPriceRule,
  createUser,
  utcDate,
} from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { prisma } from "../../../src/config/database.js";
import {
  addDaysUtc,
  endOfTehranDayUtc,
  todayInTimezone,
} from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const POPULAR_PATH = `${API_BASE}/locations/cities/popular`;
const CABINS_PATH = `${API_BASE}/cabins`;

type CityRow = { id: number; cabinsCount: number; bookingsCount: number };
type CabinRow = { id: number };

/**
 * بازه‌ی غیرهم‌پوشان برای رزروها — دیتابیس محدودیت exclusion روی رزروهای
 * هم‌پوشان یک کابین دارد، پس هر رزرو بازه‌ی مخصوص خودش را می‌گیرد.
 */
function range(index: number) {
  const day = (offset: number) =>
    utcDate(`2030-06-${String(offset).padStart(2, "0")}`);
  return { startDate: day(1 + index * 7), endDate: day(3 + index * 7) };
}

describe.skipIf(!isIntegrationDbAvailable())("landing endpoints (integration)", () => {
  let guestId: number;

  beforeEach(async () => {
    await resetDatabase();
    const guest = await createUser({ role: "guest" });
    guestId = guest.guestId!;
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  // -------------------------------------
  // GET /locations/cities/popular
  // -------------------------------------

  describe("GET /locations/cities/popular", () => {
    it("sorts by booking count desc and keeps zero-booking cities (sort, not filter)", async () => {
      const cityA = await createCity();
      const cityB = await createCity();
      const cityC = await createCity();

      const cabinA = await createCabin({ cityId: cityA.id });
      const cabinB = await createCabin({ cityId: cityB.id });
      await createCabin({ cityId: cityC.id });

      await createBooking({ cabinId: cabinA.id, guestId, status: "confirmed", ...range(0) });
      await createBooking({ cabinId: cabinA.id, guestId, status: "checkedOut", ...range(1) });
      await createBooking({ cabinId: cabinB.id, guestId, status: "checkedIn", ...range(2) });
      // pending must NOT count towards the ranking.
      await createBooking({ cabinId: cabinB.id, guestId, status: "pending", ...range(3) });

      const res = await request(app).get(`${POPULAR_PATH}?limit=10`);
      expect(res.status).toBe(200);

      const cities = res.body.data.cities as CityRow[];
      const ids = cities.map((c) => c.id);
      expect(ids.indexOf(cityA.id)).toBeLessThan(ids.indexOf(cityB.id));
      expect(ids.indexOf(cityB.id)).toBeLessThan(ids.indexOf(cityC.id));

      const a = cities.find((c) => c.id === cityA.id)!;
      expect(a.bookingsCount).toBe(2);
      expect(a.cabinsCount).toBe(1);
    });

    it("returns imageUrl + region and honours limit", async () => {
      const city = await createCity();
      await prisma.city.update({
        where: { id: city.id },
        data: { imageUrl: "https://example.com/city.jpg" },
      });

      const res = await request(app).get(`${POPULAR_PATH}?limit=1`);
      expect(res.status).toBe(200);
      expect(res.body.data.cities).toHaveLength(1);
      expect(res.body.data.cities[0]).toMatchObject({
        id: city.id,
        imageUrl: "https://example.com/city.jpg",
      });
      expect(res.body.data.cities[0].region).toMatchObject({ id: expect.any(Number) });
    });

    it("defaults to limit 8 and rejects an out-of-range limit", async () => {
      const ok = await request(app).get(POPULAR_PATH);
      expect(ok.status).toBe(200);

      const bad = await request(app).get(`${POPULAR_PATH}?limit=999`);
      expect(bad.status).toBe(400);
    });
  });

  // -------------------------------------
  // GET /cabins/last-minute
  // -------------------------------------

  describe("GET /cabins/last-minute", () => {
    it("includes only active discounts ending today/tomorrow (not later, not starting tomorrow)", async () => {
      const owner = await createUser({ role: "owner", withGuest: false });
      const today = todayInTimezone(TIMEZONE);
      const tomorrow = addDaysUtc(today, 1);

      // A — discount today..tomorrow → included.
      const cabinA = await createCabin({ regularPrice: 1_000_000 });
      await createPriceRule({
        cabinId: cabinA.id,
        actorId: owner.id,
        type: "discount",
        kind: "dateRange",
        percent: 25,
        startDate: today,
        endDate: tomorrow,
      });
      await createCabinDailyPrice({
        cabinId: cabinA.id,
        date: today,
        basePrice: 1_000_000,
        discountPercent: 25,
        finalPrice: 750_000,
      });

      // B — discount far in the future → excluded.
      const cabinB = await createCabin({ regularPrice: 1_000_000 });
      await createPriceRule({
        cabinId: cabinB.id,
        actorId: owner.id,
        type: "discount",
        kind: "dateRange",
        percent: 20,
        startDate: addDaysUtc(today, 5),
        endDate: addDaysUtc(today, 8),
      });

      // C — discount STARTS tomorrow → excluded (project decision).
      const cabinC = await createCabin({ regularPrice: 1_000_000 });
      await createPriceRule({
        cabinId: cabinC.id,
        actorId: owner.id,
        type: "discount",
        kind: "dateRange",
        percent: 30,
        startDate: tomorrow,
        endDate: addDaysUtc(today, 3),
      });

      // D — inactive discount → excluded.
      const cabinD = await createCabin({ regularPrice: 1_000_000 });
      await createPriceRule({
        cabinId: cabinD.id,
        actorId: owner.id,
        type: "discount",
        kind: "dateRange",
        percent: 40,
        startDate: today,
        endDate: tomorrow,
        isActive: false,
      });

      const res = await request(app).get(`${API_BASE}/cabins/last-minute`);
      expect(res.status).toBe(200);

      const cabins = res.body.data.cabins as Array<CabinRow & {
        finalPrice: number;
        originalPrice: number;
        discountPercent: number;
        expiresAt: string;
      }>;
      const ids = cabins.map((c) => c.id);
      expect(ids).toContain(cabinA.id);
      expect(ids).not.toContain(cabinB.id);
      expect(ids).not.toContain(cabinC.id);
      expect(ids).not.toContain(cabinD.id);

      const a = cabins.find((c) => c.id === cabinA.id)!;
      expect(a.finalPrice).toBe(750_000);
      expect(a.originalPrice).toBe(1_000_000);
      expect(a.discountPercent).toBe(25);
      expect(a.expiresAt).toBe(endOfTehranDayUtc(tomorrow).toISOString());
    });

    it("honours the limit query parameter", async () => {
      const owner = await createUser({ role: "owner", withGuest: false });
      const today = todayInTimezone(TIMEZONE);
      const tomorrow = addDaysUtc(today, 1);

      for (let i = 0; i < 3; i += 1) {
        const cabin = await createCabin({ regularPrice: 1_000_000 });
        await createPriceRule({
          cabinId: cabin.id,
          actorId: owner.id,
          type: "discount",
          kind: "dateRange",
          percent: 10,
          startDate: today,
          endDate: tomorrow,
        });
      }

      const res = await request(app).get(`${API_BASE}/cabins/last-minute?limit=2`);
      expect(res.status).toBe(200);
      expect(res.body.data.cabins).toHaveLength(2);
    });
  });

  // -------------------------------------
  // GET /cabins sort options
  // -------------------------------------

  describe("GET /cabins sort options", () => {
    it("orders by most_booked using confirmed/checkedIn/checkedOut only", async () => {
      const cabinA = await createCabin();
      const cabinB = await createCabin();
      const cabinC = await createCabin();

      await createBooking({ cabinId: cabinB.id, guestId, status: "confirmed", ...range(0) });
      await createBooking({ cabinId: cabinB.id, guestId, status: "checkedOut", ...range(1) });
      await createBooking({ cabinId: cabinC.id, guestId, status: "checkedIn", ...range(2) });
      await createBooking({ cabinId: cabinA.id, guestId, status: "pending", ...range(3) });

      const res = await request(app).get(`${CABINS_PATH}?sort=most_booked&limit=10`);
      expect(res.status).toBe(200);

      const ids = (res.body.data.cabins as CabinRow[]).map((c) => c.id);
      expect(ids.indexOf(cabinB.id)).toBeLessThan(ids.indexOf(cabinC.id));
      expect(ids.indexOf(cabinC.id)).toBeLessThan(ids.indexOf(cabinA.id));
    });

    it("orders newest by createdAt desc", async () => {
      const first = await createCabin();
      await createCabin();
      const third = await createCabin();

      const res = await request(app).get(`${CABINS_PATH}?sort=newest&limit=10`);
      expect(res.status).toBe(200);

      const ids = (res.body.data.cabins as CabinRow[]).map((c) => c.id);
      expect(ids.indexOf(third.id)).toBeLessThan(ids.indexOf(first.id));
    });

    it("orders rating_desc by rating", async () => {
      const low = await createCabin();
      const high = await createCabin();
      await prisma.cabin.update({ where: { id: high.id }, data: { rating: 5 } });
      await prisma.cabin.update({ where: { id: low.id }, data: { rating: 1 } });

      const res = await request(app).get(`${CABINS_PATH}?sort=rating_desc&limit=10`);
      expect(res.status).toBe(200);

      const ids = (res.body.data.cabins as CabinRow[]).map((c) => c.id);
      expect(ids.indexOf(high.id)).toBeLessThan(ids.indexOf(low.id));
    });

    it("orders price_asc by the discounted effective price", async () => {
      const today = todayInTimezone(TIMEZONE);
      const expensive = await createCabin({ regularPrice: 5_000_000 });
      const discounted = await createCabin({ regularPrice: 4_000_000 });

      await createCabinDailyPrice({
        cabinId: expensive.id,
        date: today,
        basePrice: 5_000_000,
        finalPrice: 5_000_000,
      });
      await createCabinDailyPrice({
        cabinId: discounted.id,
        date: today,
        basePrice: 4_000_000,
        discountPercent: 50,
        finalPrice: 2_000_000,
      });

      const res = await request(app).get(`${CABINS_PATH}?sort=price_asc&limit=10`);
      expect(res.status).toBe(200);

      const ids = (res.body.data.cabins as CabinRow[]).map((c) => c.id);
      expect(ids.indexOf(discounted.id)).toBeLessThan(ids.indexOf(expensive.id));
    });

    it("rejects an unknown sort value", async () => {
      const res = await request(app).get(`${CABINS_PATH}?sort=bogus`);
      expect(res.status).toBe(400);
    });
  });
});

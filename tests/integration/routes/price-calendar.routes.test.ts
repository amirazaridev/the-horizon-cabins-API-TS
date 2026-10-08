import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createCabin, createPriceRule, createUser } from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { prisma } from "../../../src/config/database.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/setting.constants.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const REBUILD_PATH = `${API_BASE}/price-calendar/rebuild`;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe.skipIf(!isIntegrationDbAvailable())("price-calendar.routes (integration)", () => {
  let cabinId: number;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;
  const today = () => todayInTimezone(TIMEZONE);

  beforeEach(async () => {
    await resetDatabase();
    cabinId = (await createCabin({ regularPrice: 1_000_000 })).id;
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  const calendarPath = () => `${API_BASE}/cabins/${cabinId}/price-calendar`;

  describe("GET /cabins/:cabinId/price-calendar", () => {
    it("is public and returns the full 120-night window (self-healing)", async () => {
      const res = await request(app).get(calendarPath());

      expect(res.status).toBe(200);
      expect(res.body.data.calendar.days).toHaveLength(DEFAULT_SETTINGS.maxAdvanceBookingDays);
      expect(res.body.data.calendar.days[0].date).toBe(`${ymd(today())}T00:00:00.000Z`);
    });

    it("reflects an active rule in the returned prices", async () => {
      await createPriceRule({
        cabinId,
        actorId: owner.id,
        type: "discount",
        kind: "dateRange",
        percent: 20,
        startDate: today(),
        endDate: addDaysUtc(today(), 3),
      });
      // rebuild via the owner endpoint so the calendar reflects the rule
      await request(app)
        .post(REBUILD_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ cabinId })
        .expect(200);

      const res = await request(app).get(calendarPath());
      const firstDay = res.body.data.calendar.days[0];
      expect(firstDay.finalPrice).toBe(800_000);
      expect(firstDay.discountPercent).toBe(20);
    });

    it("returns a sub-range within the window", async () => {
      const from = ymd(addDaysUtc(today(), 1));
      const to = ymd(addDaysUtc(today(), 5));
      const res = await request(app).get(`${calendarPath()}?from=${from}&to=${to}`);

      expect(res.status).toBe(200);
      expect(res.body.data.calendar.days).toHaveLength(5);
    });

    it("rejects a range outside the window", async () => {
      const before = ymd(addDaysUtc(today(), -1));
      const res = await request(app).get(`${calendarPath()}?from=${before}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PRICE_CALENDAR_RANGE_INVALID");

      const after = ymd(addDaysUtc(today(), DEFAULT_SETTINGS.maxAdvanceBookingDays + 5));
      const res2 = await request(app).get(`${calendarPath()}?to=${after}`);
      expect(res2.status).toBe(400);
      expect(res2.body.code).toBe("PRICE_CALENDAR_RANGE_INVALID");
    });

    it("rejects from > to", async () => {
      const res = await request(app).get(
        `${calendarPath()}?from=${ymd(addDaysUtc(today(), 5))}&to=${ymd(today())}`,
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for an unknown cabin", async () => {
      const res = await request(app).get(`${API_BASE}/cabins/999999/price-calendar`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /price-calendar/rebuild", () => {
    it("is owner only", async () => {
      expect((await request(app).post(REBUILD_PATH).send({})).status).toBe(401);

      const asAdmin = await request(app)
        .post(REBUILD_PATH)
        .set("Cookie", cookieFor(admin))
        .send({});
      expect(asAdmin.status).toBe(403);

      const asOwner = await request(app)
        .post(REBUILD_PATH)
        .set("Cookie", cookieFor(owner))
        .send({});
      expect(asOwner.status).toBe(200);
    });

    it("rebuilds a single cabin and reports the rows written", async () => {
      const res = await request(app)
        .post(REBUILD_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ cabinId });

      expect(res.status).toBe(200);
      expect(res.body.data.cabinsRebuilt).toBe(1);
      expect(res.body.data.rowsWritten).toBe(DEFAULT_SETTINGS.maxAdvanceBookingDays);
    });

    it("returns 404 for an unknown cabin", async () => {
      const res = await request(app)
        .post(REBUILD_PATH)
        .set("Cookie", cookieFor(owner))
        .send({ cabinId: 999_999 });
      expect(res.status).toBe(404);
    });

    it("rebuilds all cabins when cabinId is omitted", async () => {
      await createCabin({ regularPrice: 2_000_000 });

      const res = await request(app)
        .post(REBUILD_PATH)
        .set("Cookie", cookieFor(owner))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.cabinsRebuilt).toBe(2);
      expect(res.body.data.rowsWritten).toBe(DEFAULT_SETTINGS.maxAdvanceBookingDays * 2);
    });
  });
});

void prisma;

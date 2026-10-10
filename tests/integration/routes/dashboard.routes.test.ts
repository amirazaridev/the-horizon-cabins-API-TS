import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import {
  createBooking,
  createCabin,
  createCity,
  createUser,
  utcDate,
} from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const SNAPSHOT_PATH = `${API_BASE}/dashboard/snapshot`;
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const today = () => todayInTimezone(TIMEZONE);

const RANGE_FROM = utcDate("2026-06-10");
const RANGE_TO = utcDate("2026-06-20");
const rangeQuery = `from=${ymd(RANGE_FROM)}&to=${ymd(RANGE_TO)}`;

describe.skipIf(!isIntegrationDbAvailable())("dashboard.routes (integration)", () => {
  let guest: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let bookingGuest: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    guest = await createUser({ role: "guest" });
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
    bookingGuest = await createUser({ role: "guest", fullName: "Booking Guest" });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  const getSnapshot = (query: string, user = admin) =>
    request(app).get(`${SNAPSHOT_PATH}?${query}`).set("Cookie", cookieFor(user));

  const snapshotOf = (query: string, user = admin) =>
    getSnapshot(query, user).then((res) => res.body.data.snapshot);

  // ==================================================================
  // Permissions
  // ==================================================================
  describe("permissions", () => {
    it("requires auth (401) and restricts to admin|owner (403 for guest)", async () => {
      expect((await request(app).get(`${SNAPSHOT_PATH}?${rangeQuery}`)).status).toBe(401);
      expect((await getSnapshot(rangeQuery, guest)).status).toBe(403);
      expect((await getSnapshot(rangeQuery, admin)).status).toBe(200);
      expect((await getSnapshot(rangeQuery, owner)).status).toBe(200);
    });
  });

  // ==================================================================
  // Validation
  // ==================================================================
  describe("query validation", () => {
    it("rejects a missing range (400)", async () => {
      expect((await getSnapshot("")).status).toBe(400);
    });

    it("rejects from > to (400)", async () => {
      const res = await getSnapshot("from=2026-06-20&to=2026-06-10");
      expect(res.status).toBe(400);
    });

    it("rejects an unknown status (400)", async () => {
      expect((await getSnapshot(`${rangeQuery}&statuses=pending,bogus`)).status).toBe(400);
    });
  });

  // ==================================================================
  // Shape
  // ==================================================================
  describe("response shape", () => {
    it("returns the snapshot envelope with exactly the expected keys", async () => {
      const snapshot = await snapshotOf(rangeQuery);
      expect(Object.keys(snapshot).sort()).toEqual(
        [
          "bookings",
          "cabins",
          "compareBookings",
          "compareRange",
          "forwardBookings",
          "range",
          "today",
          "todayBookings",
        ].sort(),
      );
    });

    it("echoes the requested range and today", async () => {
      const snapshot = await snapshotOf(rangeQuery);
      expect(snapshot.range.from).toBe("2026-06-10T00:00:00.000Z");
      expect(snapshot.range.to).toBe("2026-06-20T00:00:00.000Z");
      expect(snapshot.today).toBe(today().toISOString());
    });
  });

  // ==================================================================
  // Range overlap
  // ==================================================================
  describe("range overlap", () => {
    it("includes boundary-crossing bookings and excludes those fully outside", async () => {
      const cabin = await createCabin();
      const guestId = bookingGuest.guestId!;

      // overlaps the start boundary (ends inside the range)
      await createBooking({
        cabinId: cabin.id,
        guestId,
        startDate: utcDate("2026-06-08"),
        endDate: utcDate("2026-06-11"),
      });
      // overlaps the end boundary (starts inside the range)
      await createBooking({
        cabinId: cabin.id,
        guestId,
        startDate: utcDate("2026-06-20"),
        endDate: utcDate("2026-06-23"),
      });
      // fully before the range
      await createBooking({
        cabinId: cabin.id,
        guestId,
        startDate: utcDate("2026-06-01"),
        endDate: utcDate("2026-06-05"),
      });
      // fully after the range
      await createBooking({
        cabinId: cabin.id,
        guestId,
        startDate: utcDate("2026-07-01"),
        endDate: utcDate("2026-07-03"),
      });

      const snapshot = await snapshotOf(rangeQuery);
      expect(snapshot.bookings).toHaveLength(2);
    });
  });

  // ==================================================================
  // Filters
  // ==================================================================
  describe("filters", () => {
    it("filters by city", async () => {
      const cityA = await createCity();
      const cityB = await createCity();
      const cabinA = await createCabin({ cityId: cityA.id });
      const cabinB = await createCabin({ cityId: cityB.id });
      const guestId = bookingGuest.guestId!;

      await createBooking({ cabinId: cabinA.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14") });
      await createBooking({ cabinId: cabinB.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14") });

      const snapshot = await snapshotOf(`${rangeQuery}&cityIds=${cityA.id}`);
      expect(snapshot.bookings).toHaveLength(1);
      expect(snapshot.bookings[0].cabinId).toBe(cabinA.id);
      // the cabins list is filtered too
      expect(snapshot.cabins.map((c: { id: number }) => c.id)).toEqual([cabinA.id]);
    });

    it("filters by cabin", async () => {
      const cabinA = await createCabin();
      const cabinB = await createCabin();
      const guestId = bookingGuest.guestId!;

      await createBooking({ cabinId: cabinA.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14") });
      await createBooking({ cabinId: cabinB.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14") });

      const snapshot = await snapshotOf(`${rangeQuery}&cabinIds=${cabinB.id}`);
      expect(snapshot.bookings).toHaveLength(1);
      expect(snapshot.bookings[0].cabinId).toBe(cabinB.id);
    });

    it("filters by booking status", async () => {
      // کابین‌های جدا لازم است: DB یک exclusion constraint روی
      // «عدم هم‌پوشانی رزروهای یک کابین» دارد.
      const cabinConfirmed = await createCabin();
      const cabinCancelled = await createCabin();
      const guestId = bookingGuest.guestId!;

      await createBooking({ cabinId: cabinConfirmed.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14"), status: "confirmed" });
      await createBooking({ cabinId: cabinCancelled.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14"), status: "cancelled" });

      const snapshot = await snapshotOf(`${rangeQuery}&statuses=confirmed`);
      expect(snapshot.bookings).toHaveLength(1);
      expect(snapshot.bookings[0].status).toBe("confirmed");
    });

    it("expands the binary payment filter into booking statuses", async () => {
      const guestId = bookingGuest.guestId!;
      const cabinPending = await createCabin();
      const cabinConfirmed = await createCabin();
      const cabinCancelled = await createCabin();

      await createBooking({ cabinId: cabinPending.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14"), status: "pending" });
      await createBooking({ cabinId: cabinConfirmed.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14"), status: "confirmed" });
      await createBooking({ cabinId: cabinCancelled.id, guestId, startDate: utcDate("2026-06-12"), endDate: utcDate("2026-06-14"), status: "cancelled" });

      const unpaid = await snapshotOf(`${rangeQuery}&paymentStatuses=unpaid`);
      expect(unpaid.bookings.map((b: { status: string }) => b.status).sort()).toEqual([
        "cancelled",
        "pending",
      ]);

      const paid = await snapshotOf(`${rangeQuery}&paymentStatuses=paid`);
      expect(paid.bookings.map((b: { status: string }) => b.status)).toEqual(["confirmed"]);
    });
  });

  // ==================================================================
  // Compare range
  // ==================================================================
  describe("compare range", () => {
    it("computes the previous period and returns compareBookings", async () => {
      const cabin = await createCabin();
      const guestId = bookingGuest.guestId!;
      // بازه ۲۰۲۶-۰۶-۱۰ تا ۲۰۲۶-۰۶-۲۰ یازده روز است ⇒ دوره‌ی قبل
      // ۲۰۲۶-۰۵-۳۰ تا ۲۰۲۶-۰۶-۰۹ (بی‌درنگ پیش از from).
      await createBooking({ cabinId: cabin.id, guestId, startDate: utcDate("2026-06-05"), endDate: utcDate("2026-06-07") });

      const snapshot = await snapshotOf(`${rangeQuery}&compare=prev-period`);
      expect(snapshot.compareRange.from).toBe("2026-05-30T00:00:00.000Z");
      expect(snapshot.compareRange.to).toBe("2026-06-09T00:00:00.000Z");
      expect(snapshot.compareBookings).toHaveLength(1);
    });

    it("returns a null compareRange and empty compareBookings for `none`", async () => {
      const snapshot = await snapshotOf(`${rangeQuery}&compare=none`);
      expect(snapshot.compareRange).toBeNull();
      expect(snapshot.compareBookings).toEqual([]);
    });
  });

  // ==================================================================
  // Today / forward — independent of the requested range
  // ==================================================================
  describe("operational widgets", () => {
    it("returns today's arrivals/departures regardless of the requested range", async () => {
      const cabin = await createCabin();
      const t = today();
      await createBooking({
        cabinId: cabin.id,
        guestId: bookingGuest.guestId!,
        startDate: t,
        endDate: addDaysUtc(t, 2),
        status: "confirmed",
      });

      const snapshot = await snapshotOf("from=2020-01-01&to=2020-01-31");
      expect(snapshot.bookings).toHaveLength(0);
      expect(snapshot.todayBookings).toHaveLength(1);
    });

    it("excludes cancelled bookings from today's list", async () => {
      const cabin = await createCabin();
      const t = today();
      await createBooking({
        cabinId: cabin.id,
        guestId: bookingGuest.guestId!,
        startDate: t,
        endDate: addDaysUtc(t, 2),
        status: "cancelled",
      });

      const snapshot = await snapshotOf(rangeQuery);
      expect(snapshot.todayBookings).toHaveLength(0);
    });

    it("returns forward bookings within the 90-day horizon only", async () => {
      const cabin = await createCabin();
      const t = today();
      const guestId = bookingGuest.guestId!;
      await createBooking({ cabinId: cabin.id, guestId, startDate: addDaysUtc(t, 5), endDate: addDaysUtc(t, 7), status: "confirmed" });
      await createBooking({ cabinId: cabin.id, guestId, startDate: addDaysUtc(t, 200), endDate: addDaysUtc(t, 202), status: "confirmed" });

      const snapshot = await snapshotOf(rangeQuery);
      expect(snapshot.forwardBookings).toHaveLength(1);
    });
  });
});

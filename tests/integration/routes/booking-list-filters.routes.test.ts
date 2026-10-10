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

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const BOOKINGS_PATH = `${API_BASE}/bookings`;

describe.skipIf(!isIntegrationDbAvailable())("booking list filters (integration)", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let bookingGuest: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: "admin", withGuest: false });
    bookingGuest = await createUser({ role: "guest", fullName: "Ali Rezaei" });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  const list = (query: string) =>
    request(app).get(`${BOOKINGS_PATH}?${query}`).set("Cookie", cookieFor(admin));

  /** یک کابین در شهر مشخص می‌سازد. */
  const cabinInCity = async (cityId: number) => createCabin({ cityId });

  it("filters by a CSV list of statuses", async () => {
    const cabinA = await createCabin();
    const cabinB = await createCabin();
    const cabinC = await createCabin();
    const guestId = bookingGuest.guestId!;

    await createBooking({ cabinId: cabinA.id, guestId, status: "confirmed" });
    await createBooking({ cabinId: cabinB.id, guestId, status: "checkedIn" });
    await createBooking({ cabinId: cabinC.id, guestId, status: "cancelled" });

    const res = await list("statuses=confirmed,checkedIn");

    expect(res.status).toBe(200);
    const statuses = res.body.data.bookings.map((b: { status: string }) => b.status).sort();
    expect(statuses).toEqual(["checkedIn", "confirmed"]);
  });

  it("filters by city (through the cabin relation)", async () => {
    const cityA = await createCity();
    const cityB = await createCity();
    const cabinA = await cabinInCity(cityA.id);
    const cabinB = await cabinInCity(cityB.id);
    const guestId = bookingGuest.guestId!;

    await createBooking({ cabinId: cabinA.id, guestId });
    await createBooking({ cabinId: cabinB.id, guestId });

    const res = await list(`cityId=${cityA.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
    expect(res.body.data.bookings[0].cabinId).toBe(cabinA.id);
  });

  it("searches guests by name (case-insensitive contains)", async () => {
    const cabinA = await createCabin();
    const cabinB = await createCabin();
    const otherGuest = await createUser({ role: "guest", fullName: "Sara Ahmadi" });

    await createBooking({ cabinId: cabinA.id, guestId: bookingGuest.guestId! });
    await createBooking({ cabinId: cabinB.id, guestId: otherGuest.guestId! });

    const res = await list("guestQuery=reza");

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
    expect(res.body.data.bookings[0].guest.fullName).toBe("Ali Rezaei");
  });

  it("filters by a start-date range", async () => {
    const cabinA = await createCabin();
    const cabinB = await createCabin();
    const guestId = bookingGuest.guestId!;

    await createBooking({
      cabinId: cabinA.id,
      guestId,
      startDate: utcDate("2026-06-05"),
      endDate: utcDate("2026-06-08"),
    });
    await createBooking({
      cabinId: cabinB.id,
      guestId,
      startDate: utcDate("2026-08-05"),
      endDate: utcDate("2026-08-08"),
    });

    const res = await list("startDateFrom=2026-06-01&startDateTo=2026-06-30");

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
    expect(res.body.data.bookings[0].cabinId).toBe(cabinA.id);
  });

  it("combines filters (statuses + city)", async () => {
    const cityA = await createCity();
    const cityB = await createCity();
    const cabinA = await cabinInCity(cityA.id);
    const cabinB = await cabinInCity(cityB.id);
    const guestId = bookingGuest.guestId!;

    await createBooking({ cabinId: cabinA.id, guestId, status: "confirmed" });
    await createBooking({ cabinId: cabinB.id, guestId, status: "confirmed" });

    const res = await list(`statuses=confirmed&cityId=${cityB.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
    expect(res.body.data.bookings[0].cabinId).toBe(cabinB.id);
  });

  it("rejects a `guestQuery` shorter than 2 characters (400)", async () => {
    expect((await list("guestQuery=a")).status).toBe(400);
  });
});

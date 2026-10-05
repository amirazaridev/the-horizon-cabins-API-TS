import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createCabin, createUser } from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const CABINS_PATH = `${API_BASE}/cabins`;

const validCabinBody = (cityId: number) => ({
  name: `Cabin ${Date.now()}`,
  maxCapacity: 4,
  regularPrice: 1_000_000,
  description: "Test cabin",
  amenities: ["wifi"],
  bedrooms: 2,
  bathrooms: 1,
  areaSqm: 80,
  latitude: 35.7,
  longitude: 51.4,
  cityId,
});

describe.skipIf(!isIntegrationDbAvailable())("cabin write guards (integration)", () => {
  let cabinId: number;
  let cityId: number;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let guest: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    const cabin = await createCabin({ regularPrice: 1_000_000 });
    cabinId = cabin.id;
    cityId = cabin.cityId;
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
    guest = await createUser({ role: "guest", withGuest: true });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  describe("POST /cabins", () => {
    it("rejects anonymous requests with 401", async () => {
      const res = await request(app).post(CABINS_PATH).send(validCabinBody(cityId));
      expect(res.status).toBe(401);
    });

    it("rejects a guest with 403", async () => {
      const res = await request(app)
        .post(CABINS_PATH)
        .set("Cookie", cookieFor(guest))
        .send(validCabinBody(cityId));
      expect(res.status).toBe(403);
    });

    //* مجوز عبور کرده است؛ شکست ۴۰۰ فقط از قاعده‌ی «حداقل یک تصویر» می‌آید
    //* (منبع: uploadCabinImages) و به P7 ربطی ندارد.
    it("lets an admin past the auth guard (image rule still applies)", async () => {
      const res = await request(app)
        .post(CABINS_PATH)
        .set("Cookie", cookieFor(admin))
        .send(validCabinBody(cityId));
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("lets an owner past the auth guard (image rule still applies)", async () => {
      const res = await request(app)
        .post(CABINS_PATH)
        .set("Cookie", cookieFor(owner))
        .send(validCabinBody(cityId));
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("PATCH /cabins/:id", () => {
    it("rejects anonymous requests with 401", async () => {
      const res = await request(app).patch(`${CABINS_PATH}/${cabinId}`).send({});
      expect(res.status).toBe(401);
    });

    it("rejects a guest with 403", async () => {
      const res = await request(app)
        .patch(`${CABINS_PATH}/${cabinId}`)
        .set("Cookie", cookieFor(guest))
        .send({});
      expect(res.status).toBe(403);
    });

    it("lets an owner past the auth guard (image rule still applies)", async () => {
      const res = await request(app)
        .patch(`${CABINS_PATH}/${cabinId}`)
        .set("Cookie", cookieFor(owner))
        .send({ maxCapacity: 6, keepExistingImages: ["https://example.com/a.jpg"] });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("DELETE /cabins/:id", () => {
    it("rejects anonymous requests with 401", async () => {
      const res = await request(app).delete(`${CABINS_PATH}/${cabinId}`);
      expect(res.status).toBe(401);
    });

    it("rejects a guest with 403", async () => {
      const res = await request(app)
        .delete(`${CABINS_PATH}/${cabinId}`)
        .set("Cookie", cookieFor(guest));
      expect(res.status).toBe(403);
    });

    it("allows an admin (204)", async () => {
      const res = await request(app)
        .delete(`${CABINS_PATH}/${cabinId}`)
        .set("Cookie", cookieFor(admin));
      expect(res.status).toBe(204);
    });
  });

  describe("POST /cabins/:id/categories", () => {
    it("rejects anonymous requests with 401", async () => {
      const res = await request(app).post(`${CABINS_PATH}/${cabinId}/categories`).send({});
      expect(res.status).toBe(401);
    });

    it("rejects a guest with 403", async () => {
      const res = await request(app)
        .post(`${CABINS_PATH}/${cabinId}/categories`)
        .set("Cookie", cookieFor(guest))
        .send({ categoryIds: [] });
      expect(res.status).toBe(403);
    });
  });
});

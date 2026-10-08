import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createUser } from "../../helpers/factories.js";
import { getTestApp, USER_ME_PATH } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { prisma } from "../../../src/config/database.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

describe.skipIf(!isIntegrationDbAvailable())("user.routes (integration)", () => {
  let guest: Awaited<ReturnType<typeof createUser>>;
  let otherGuest: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    guest = await createUser({ role: "guest", fullName: "Original Name" });
    otherGuest = await createUser({ role: "guest" });
    admin = await createUser({ role: "admin", withGuest: false });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  // ==================================================================
  // PATCH /user/me
  // ==================================================================
  describe("PATCH /user/me", () => {
    it("should reject an unauthenticated request with 401", async () => {
      const res = await request(app).patch(USER_ME_PATH).send({ fullName: "New Name" });
      expect(res.status).toBe(401);
    });

    it("should reject an invalid body with 400 and the project error shape", async () => {
      const res = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "New Name", phoneNumber: "not-a-phone" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ status: "fail", code: "VALIDATION_ERROR" });
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("should update the guest profile and return the GET /user/me shape", async () => {
      const res = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({
          fullName: "New Name",
          phoneNumber: "09123456789",
          nationalId: "1234567890",
          dateOfBirth: "1991-08-03",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.guest).toMatchObject({
        fullName: "New Name",
        phoneNumber: "09123456789",
        nationalId: "1234567890",
      });
      // `@db.Date` با زمان UTC می‌آید؛ فقط بخش تاریخ مهم است.
      expect(res.body.data.guest.dateOfBirth.slice(0, 10)).toBe("1991-08-03");
      // نقش guest در پاسخ حذف می‌شود (مثل GET /user/me).
      expect(res.body.data.user.role).toBeUndefined();
    });

    it("should persist the change in the database", async () => {
      await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "Persisted Name", phoneNumber: "09120000000" });

      const row = await prisma.guest.findUnique({ where: { userId: guest.id } });
      expect(row?.fullName).toBe("Persisted Name");
      expect(row?.phoneNumber).toBe("09120000000");
    });

    it("should not clear other fields when they are absent (partial PATCH)", async () => {
      await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "First Update", phoneNumber: "09121111111" });

      const res = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "Second Update" });

      expect(res.status).toBe(200);
      expect(res.body.data.guest.fullName).toBe("Second Update");
      expect(res.body.data.guest.phoneNumber).toBe("09121111111");
    });

    it("should clear an optional field when an empty string is sent", async () => {
      await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "With Phone", phoneNumber: "09121111111" });

      const res = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "With Phone", phoneNumber: "" });

      expect(res.status).toBe(200);
      expect(res.body.data.guest.phoneNumber).toBeNull();
    });

    it("should reject a duplicate national ID with 409", async () => {
      const first = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "Guest One", nationalId: "1234567890" });
      expect(first.status).toBe(200);

      const second = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(otherGuest))
        .send({ fullName: "Guest Two", nationalId: "1234567890" });

      expect(second.status).toBe(409);
      expect(second.body).toMatchObject({ status: "fail", code: "DUPLICATE_ENTRY" });
    });

    it("should reject a caller without a guest profile with 403", async () => {
      const res = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(admin))
        .send({ fullName: "Admin Name" });

      expect(res.status).toBe(403);
    });

    it("should reject a non-existent calendar date with 400", async () => {
      const res = await request(app)
        .patch(USER_ME_PATH)
        .set("Cookie", cookieFor(guest))
        .send({ fullName: "New Name", dateOfBirth: "1991-02-30" });

      expect(res.status).toBe(400);
    });
  });
});

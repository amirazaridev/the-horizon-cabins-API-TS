import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createBooking, createCabin, createUser } from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

//* روتر کاربران در `routes/index.ts` روی مسیر مفرد `/user` مانت شده است.
const USERS_PATH = `${API_BASE}/user`;

describe.skipIf(!isIntegrationDbAvailable())("users routes (integration)", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let guest: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
    guest = await createUser({ role: "guest", fullName: "Ali Rezaei" });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  const list = (query = "", user = admin) =>
    request(app)
      .get(`${USERS_PATH}${query ? `?${query}` : ""}`)
      .set("Cookie", cookieFor(user));

  it("lists only guest users and never leaks the password", async () => {
    const res = await list();

    expect(res.status).toBe(200);
    const users = res.body.data.users as Array<{
      role: string;
      email: string;
      password?: string;
      guest: { fullName: string } | null;
    }>;

    expect(users.map((user) => user.role)).toEqual(["guest"]);
    expect(users[0].email).toBe(guest.email);
    expect(users[0].password).toBeUndefined();
    expect(users[0].guest?.fullName).toBe("Ali Rezaei");
  });

  it("returns pagination meta", async () => {
    const res = await list("limit=1");

    expect(res.status).toBe(200);
    expect(res.body.data.meta).toMatchObject({
      currentPage: 1,
      limit: 1,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it("filters by active status", async () => {
    await createUser({ role: "guest", fullName: "Blocked Guest", active: false });

    const active = await list("active=true");
    expect(active.body.data.users).toHaveLength(1);
    expect(active.body.data.users[0].guest.fullName).toBe("Ali Rezaei");

    const inactive = await list("active=false");
    expect(inactive.body.data.users).toHaveLength(1);
    expect(inactive.body.data.users[0].guest.fullName).toBe("Blocked Guest");
  });

  it("searches by guest name (case-insensitive) and by email", async () => {
    await createUser({ role: "guest", fullName: "Sara Ahmadi" });

    const byName = await list("q=reza");
    expect(byName.body.data.users).toHaveLength(1);
    expect(byName.body.data.users[0].guest.fullName).toBe("Ali Rezaei");

    const byEmail = await list(`q=${encodeURIComponent(guest.email)}`);
    expect(byEmail.body.data.users).toHaveLength(1);
    expect(byEmail.body.data.users[0].id).toBe(guest.id);
  });

  it("rejects a `q` shorter than 2 characters (400)", async () => {
    expect((await list("q=a")).status).toBe(400);
  });

  it("forbids guests from listing users (403)", async () => {
    expect((await list("", guest)).status).toBe(403);
  });

  it("activates/deactivates a guest account (admin)", async () => {
    const res = await request(app)
      .patch(`${USERS_PATH}/${guest.id}/status`)
      .set("Cookie", cookieFor(admin))
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.data.user.active).toBe(false);

    const blocked = await list("active=false");
    expect(blocked.body.data.users).toHaveLength(1);
    expect(blocked.body.data.users[0].id).toBe(guest.id);
  });

  it("forbids an admin from toggling a non-guest account (403)", async () => {
    const otherAdmin = await createUser({ role: "admin", withGuest: false });

    const res = await request(app)
      .patch(`${USERS_PATH}/${otherAdmin.id}/status`)
      .set("Cookie", cookieFor(admin))
      .send({ active: false });

    expect(res.status).toBe(403);
  });

  it("changes a guest role for owner only", async () => {
    const asAdmin = await request(app)
      .patch(`${USERS_PATH}/${guest.id}/role`)
      .set("Cookie", cookieFor(admin))
      .send({ role: "admin" });
    expect(asAdmin.status).toBe(403);

    const asOwner = await request(app)
      .patch(`${USERS_PATH}/${guest.id}/role`)
      .set("Cookie", cookieFor(owner))
      .send({ role: "admin" });
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data.user.role).toBe("admin");

    //* پس از ارتقا دیگر «مهمان» نیست، پس از لیست خارج می‌شود.
    const after = await list();
    expect(after.body.data.users).toHaveLength(0);
  });

  /* ==========================================================================
     سیاست‌های دسترسی
     ========================================================================== */

  const patch = (path: string, user: typeof admin, body: Record<string, unknown>) =>
    request(app)
      .patch(`${USERS_PATH}${path}`)
      .set("Cookie", cookieFor(user))
      .send(body);

  const remove = (id: number, user: typeof admin) =>
    request(app).delete(`${USERS_PATH}/${id}`).set("Cookie", cookieFor(user));

  it("lists admins and owners when roles=admin,owner", async () => {
    const res = await list("roles=admin,owner", owner);

    expect(res.status).toBe(200);
    const roles = (res.body.data.users as Array<{ role: string }>)
      .map((user) => user.role)
      .sort();
    expect(roles).toEqual(["admin", "owner"]);
  });

  it("forbids an admin from listing admins/owners (403)", async () => {
    const res = await list("roles=admin,owner", admin);
    expect(res.status).toBe(403);
  });

  it("allows an owner to deactivate an admin", async () => {
    const res = await patch(`/${admin.id}/status`, owner, { active: false });
    expect(res.status).toBe(200);
    expect(res.body.data.user.active).toBe(false);
  });

  it("forbids touching another owner's account (status)", async () => {
    const otherOwner = await createUser({ role: "owner", withGuest: false });
    expect((await patch(`/${otherOwner.id}/status`, owner, { active: false })).status).toBe(403);
  });

  it("forbids changing an owner's role", async () => {
    const otherOwner = await createUser({ role: "owner", withGuest: false });
    expect((await patch(`/${otherOwner.id}/role`, owner, { role: "admin" })).status).toBe(403);
  });

  it("forbids an admin from changing any role (403)", async () => {
    expect((await patch(`/${guest.id}/role`, admin, { role: "admin" })).status).toBe(403);
  });

  it("enforces the two-owner limit", async () => {
    //* beforeEach already created one owner ⇒ this makes two.
    await createUser({ role: "owner", withGuest: false });

    const res = await patch(`/${guest.id}/role`, owner, { role: "owner" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OWNER_LIMIT_REACHED");
  });

  it("forbids an admin from deleting users (403)", async () => {
    expect((await remove(guest.id, admin)).status).toBe(403);
  });

  it("forbids deleting an owner (403)", async () => {
    expect((await remove(owner.id, owner)).status).toBe(403);
  });

  it("deletes a guest without dependencies", async () => {
    const disposable = await createUser({ role: "guest", fullName: "Disposable Guest" });

    const res = await remove(disposable.id, owner);
    expect(res.status).toBe(200);

    const after = await list();
    expect(after.body.data.users.map((u: { id: number }) => u.id)).not.toContain(disposable.id);
  });

  it("refuses to delete a guest that has bookings (409)", async () => {
    const cabin = await createCabin();
    await createBooking({ cabinId: cabin.id, guestId: guest.guestId! });

    const res = await remove(guest.id, owner);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("USER_HAS_DEPENDENCIES");
  });
});

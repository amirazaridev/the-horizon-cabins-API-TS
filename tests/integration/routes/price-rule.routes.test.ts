import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { useIntegrationDb, isIntegrationDbAvailable } from "../../helpers/integration.js";
import { resetDatabase } from "../../helpers/db.js";
import { createCabin, createPriceRule, createUser, utcDate } from "../../helpers/factories.js";
import { getTestApp, API_BASE } from "../../helpers/app.js";
import { cookieFor } from "../../helpers/auth.js";
import { prisma } from "../../../src/config/database.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";
import * as priceRuleService from "../../../src/services/price-rule.service.js";
import { AppError } from "../../../src/utils/AppError.js";

const ctx = useIntegrationDb();
void ctx;
const app = getTestApp();

const PRICE_RULES_PATH = `${API_BASE}/price-rules`;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const TODAY = () => todayInTimezone(TIMEZONE);

describe.skipIf(!isIntegrationDbAvailable())("price-rule.routes (integration)", () => {
  let cabinId: number;
  let guest: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let owner: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    await resetDatabase();
    cabinId = (await createCabin({ regularPrice: 1_000_000 })).id;
    guest = await createUser({ role: "guest" });
    admin = await createUser({ role: "admin", withGuest: false });
    owner = await createUser({ role: "owner", withGuest: false });
  });

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
  });

  const cabinRulesPath = () => `${API_BASE}/cabins/${cabinId}/price-rules`;

  const validDateRangeBody = () => ({
    type: "discount",
    kind: "dateRange",
    percent: 20,
    startDate: ymd(TODAY()),
    endDate: ymd(addDaysUtc(TODAY(), 5)),
  });

  // ==================================================================
  // Permissions
  // ==================================================================
  describe("permissions", () => {
    it("GET /cabins/:id/price-rules requires auth (401) and admin|owner (403 for guest)", async () => {
      expect((await request(app).get(cabinRulesPath())).status).toBe(401);

      const asGuest = await request(app).get(cabinRulesPath()).set("Cookie", cookieFor(guest));
      expect(asGuest.status).toBe(403);

      const asAdmin = await request(app).get(cabinRulesPath()).set("Cookie", cookieFor(admin));
      expect(asAdmin.status).toBe(200);

      const asOwner = await request(app).get(cabinRulesPath()).set("Cookie", cookieFor(owner));
      expect(asOwner.status).toBe(200);
    });

    it("POST /cabins/:id/price-rules is admin|owner only", async () => {
      const asGuest = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(guest))
        .send(validDateRangeBody());
      expect(asGuest.status).toBe(403);

      const asAdmin = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send(validDateRangeBody());
      expect(asAdmin.status).toBe(201);
      expect(asAdmin.body.data.rule.percent).toBe(20);
    });

    it("PATCH /price-rules/:id is admin|owner only", async () => {
      const rule = await createPriceRule({ cabinId, actorId: owner.id });

      const asGuest = await request(app)
        .patch(`${PRICE_RULES_PATH}/${rule.id}`)
        .set("Cookie", cookieFor(guest))
        .send({ percent: 15 });
      expect(asGuest.status).toBe(403);

      const asAdmin = await request(app)
        .patch(`${PRICE_RULES_PATH}/${rule.id}`)
        .set("Cookie", cookieFor(admin))
        .send({ percent: 15 });
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.data.rule.percent).toBe(15);
    });

    it("DELETE /price-rules/:id is owner only (admin gets 403)", async () => {
      const rule = await createPriceRule({ cabinId, actorId: owner.id });

      const asAdmin = await request(app)
        .delete(`${PRICE_RULES_PATH}/${rule.id}`)
        .set("Cookie", cookieFor(admin));
      expect(asAdmin.status).toBe(403);

      const asOwner = await request(app)
        .delete(`${PRICE_RULES_PATH}/${rule.id}`)
        .set("Cookie", cookieFor(owner));
      expect(asOwner.status).toBe(204);
    });

    it("POST /price-rules/bulk is owner only (admin gets 403)", async () => {
      const body = { allCabins: true, rule: validDateRangeBody() };

      const asAdmin = await request(app)
        .post(`${PRICE_RULES_PATH}/bulk`)
        .set("Cookie", cookieFor(admin))
        .send(body);
      expect(asAdmin.status).toBe(403);

      const asOwner = await request(app)
        .post(`${PRICE_RULES_PATH}/bulk`)
        .set("Cookie", cookieFor(owner))
        .send(body);
      expect(asOwner.status).toBe(201);
    });

    it("GET /price-rules/:id/history is admin|owner only", async () => {
      const rule = await createPriceRule({ cabinId, actorId: owner.id });

      expect((await request(app).get(`${PRICE_RULES_PATH}/${rule.id}/history`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`${PRICE_RULES_PATH}/${rule.id}/history`)
            .set("Cookie", cookieFor(guest))
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`${PRICE_RULES_PATH}/${rule.id}/history`)
            .set("Cookie", cookieFor(admin))
        ).status,
      ).toBe(200);
    });
  });

  // ==================================================================
  // CRUD
  // ==================================================================
  describe("CRUD", () => {
    it("creates a rule, lists it with filters, and returns 404 for an unknown cabin", async () => {
      await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send(validDateRangeBody());

      const list = await request(app).get(cabinRulesPath()).set("Cookie", cookieFor(admin));
      expect(list.status).toBe(200);
      expect(list.body.data.rules).toHaveLength(1);

      const filtered = await request(app)
        .get(`${cabinRulesPath()}?type=surcharge`)
        .set("Cookie", cookieFor(admin));
      expect(filtered.body.data.rules).toHaveLength(0);

      const missing = await request(app)
        .get(`${API_BASE}/cabins/999999/price-rules`)
        .set("Cookie", cookieFor(admin));
      expect(missing.status).toBe(404);
    });

    it("rejects a dateRange rule whose endDate is in the past", async () => {
      const res = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send({
          type: "discount",
          kind: "dateRange",
          percent: 10,
          startDate: ymd(addDaysUtc(TODAY(), -10)),
          endDate: ymd(addDaysUtc(TODAY(), -1)),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PRICE_RULE_END_DATE_IN_PAST");
    });

    it("rejects a dateRange rule beyond PRICE_RULE_MAX_FUTURE_DAYS", async () => {
      const res = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send({
          type: "discount",
          kind: "dateRange",
          percent: 10,
          startDate: ymd(TODAY()),
          endDate: ymd(addDaysUtc(TODAY(), 366)),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PRICE_RULE_INVALID");
    });

    it("updates a rule and records audit history (created + updated)", async () => {
      const created = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send(validDateRangeBody());

      const id = created.body.data.rule.id;
      await request(app)
        .patch(`${PRICE_RULES_PATH}/${id}`)
        .set("Cookie", cookieFor(admin))
        .send({ percent: 35, label: "updated" });

      const history = await request(app)
        .get(`${PRICE_RULES_PATH}/${id}/history`)
        .set("Cookie", cookieFor(admin));

      expect(history.status).toBe(200);
      const actions = history.body.data.history.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(["created", "updated"]);
    });

    it("keeps history after a hard delete", async () => {
      const created = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send(validDateRangeBody());
      const id = created.body.data.rule.id;

      await request(app)
        .delete(`${PRICE_RULES_PATH}/${id}`)
        .set("Cookie", cookieFor(owner))
        .expect(204);

      const history = await request(app)
        .get(`${PRICE_RULES_PATH}/${id}/history`)
        .set("Cookie", cookieFor(admin));

      expect(history.status).toBe(200);
      const actions = history.body.data.history.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(["created", "deleted"]);
    });

    it("records activated/deactivated actions on isActive toggles", async () => {
      const created = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send(validDateRangeBody());
      const id = created.body.data.rule.id;

      await request(app)
        .patch(`${PRICE_RULES_PATH}/${id}`)
        .set("Cookie", cookieFor(admin))
        .send({ isActive: false })
        .expect(200);
      await request(app)
        .patch(`${PRICE_RULES_PATH}/${id}`)
        .set("Cookie", cookieFor(admin))
        .send({ isActive: true })
        .expect(200);

      const history = await request(app)
        .get(`${PRICE_RULES_PATH}/${id}/history`)
        .set("Cookie", cookieFor(admin));
      const actions = history.body.data.history.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(["created", "deactivated", "activated"]);
    });
  });

  // ==================================================================
  // Limit validation
  // ==================================================================
  describe("limit validation", () => {
    async function create(body: Record<string, unknown>) {
      return request(app).post(cabinRulesPath()).set("Cookie", cookieFor(admin)).send(body);
    }

    it("allows 2 discounts and rejects the 3rd with 409 + details", async () => {
      const base = validDateRangeBody();
      expect((await create(base)).status).toBe(201);
      expect((await create(base)).status).toBe(201);

      const third = await create(base);
      expect(third.status).toBe(409);
      expect(third.body.code).toBe("PRICE_RULE_LIMIT_EXCEEDED");
      expect(third.body.errors.violations[0]).toMatchObject({
        type: "discount",
        reason: "MAX_COUNT",
        found: 3,
        limit: 2,
      });
    });

    it("rejects a discount percent sum above 50", async () => {
      await create({ ...validDateRangeBody(), percent: 30 });
      const res = await create({ ...validDateRangeBody(), percent: 21 });

      expect(res.status).toBe(409);
      expect(res.body.errors.violations[0]).toMatchObject({ reason: "MAX_PERCENT", limit: 50 });
    });

    it("detects a weekday-vs-dateRange overlap", async () => {
      // یک قاعده‌ی weekday برای چهارشنبه + دو قاعده‌ی dateRange روی همان چهارشنبه.
      const today = TODAY();
      const wednesday = addDaysUtc(today, ((3 - today.getUTCDay() + 7) % 7) || 7);
      const wed = ymd(wednesday);

      await create({ type: "surcharge", kind: "weekday", percent: 10, weekdays: [3] });
      await create({
        type: "surcharge",
        kind: "dateRange",
        percent: 10,
        startDate: wed,
        endDate: wed,
      });

      const third = await create({
        type: "surcharge",
        kind: "dateRange",
        percent: 10,
        startDate: wed,
        endDate: wed,
      });

      expect(third.status).toBe(409);
      expect(third.body.errors.violations[0]).toMatchObject({
        type: "surcharge",
        reason: "MAX_COUNT",
        from: wed,
        to: wed,
      });
    });

    it("ignores deactivated rules when validating limits", async () => {
      await create({ ...validDateRangeBody(), percent: 30 });
      await create({ ...validDateRangeBody(), percent: 20, isActive: false });

      // 30 + 20 غیرفعال = 30 مؤثر → درصد مجاز است؛ اما دو قاعده‌ی فعال مجاز است.
      const res = await create({ ...validDateRangeBody(), percent: 20 });
      expect(res.status).toBe(201);
    });

    it("rejects re-activating a rule whose endDate is in the past", async () => {
      // قاعده‌ی غیرفعال با endDate گذشته را مستقیم در DB می‌سازیم (سرویس اجازه نمی‌دهد).
      const stale = await createPriceRule({
        cabinId,
        actorId: owner.id,
        isActive: false,
        startDate: utcDate("2020-01-01"),
        endDate: utcDate("2020-01-05"),
      });

      const res = await request(app)
        .patch(`${PRICE_RULES_PATH}/${stale.id}`)
        .set("Cookie", cookieFor(admin))
        .send({ isActive: true });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PRICE_RULE_END_DATE_IN_PAST");
    });
  });

  // ==================================================================
  // Calendar rebuild
  // ==================================================================
  describe("calendar rebuild", () => {
    it("rebuilds the cabin calendar when a rule is created", async () => {
      const today = TODAY();
      await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send({
          type: "discount",
          kind: "dateRange",
          percent: 20,
          startDate: ymd(today),
          endDate: ymd(addDaysUtc(today, 3)),
        })
        .expect(201);

      const rows = await prisma.cabinDailyPrice.findMany({
        where: { cabinId },
        orderBy: { date: "asc" },
      });

      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.finalPrice === 800_000)).toBe(true);
      expect(rows[0].discountPercent).toBe(20);
    });

    it("removes the effect from the calendar after the rule is deleted", async () => {
      const today = TODAY();
      const created = await request(app)
        .post(cabinRulesPath())
        .set("Cookie", cookieFor(admin))
        .send({
          type: "discount",
          kind: "dateRange",
          percent: 20,
          startDate: ymd(today),
          endDate: ymd(addDaysUtc(today, 3)),
        });
      const id = created.body.data.rule.id;

      await request(app)
        .delete(`${PRICE_RULES_PATH}/${id}`)
        .set("Cookie", cookieFor(owner))
        .expect(204);

      const rows = await prisma.cabinDailyPrice.findMany({ where: { cabinId } });
      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.finalPrice === 1_000_000)).toBe(true);
    });
  });

  // ==================================================================
  // Bulk
  // ==================================================================
  describe("bulk create", () => {
    it("applies the rule to all cabins", async () => {
      const second = await createCabin({ regularPrice: 2_000_000 });

      const res = await request(app)
        .post(`${PRICE_RULES_PATH}/bulk`)
        .set("Cookie", cookieFor(owner))
        .send({
          allCabins: true,
          rule: { type: "surcharge", kind: "weekday", percent: 10, weekdays: [3] },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.count).toBe(2);

      const rules = await prisma.priceRule.findMany({ where: { type: "surcharge" } });
      expect(rules).toHaveLength(2);
      expect(new Set(rules.map((rule) => rule.cabinId))).toEqual(new Set([cabinId, second.id]));
    });

    it("is atomic: rejects the whole bulk when one cabin conflicts, with a per-cabin report", async () => {
      // کابین دوم از قبل ۲ تخفیف فعال دارد → افزودن تخفیف سوم رد می‌شود.
      const conflicting = await createCabin({ regularPrice: 2_000_000 });
      const today = TODAY();
      const baseBody = { startDate: ymd(today), endDate: ymd(addDaysUtc(today, 5)) };
      await createPriceRule({
        cabinId: conflicting.id,
        actorId: owner.id,
        startDate: today,
        endDate: addDaysUtc(today, 5),
      });
      await createPriceRule({
        cabinId: conflicting.id,
        actorId: owner.id,
        startDate: today,
        endDate: addDaysUtc(today, 5),
      });

      const res = await request(app)
        .post(`${PRICE_RULES_PATH}/bulk`)
        .set("Cookie", cookieFor(owner))
        .send({
          allCabins: true,
          rule: { type: "discount", kind: "dateRange", percent: 10, ...baseBody },
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PRICE_RULE_LIMIT_EXCEEDED");
      expect(res.body.errors.conflicts).toHaveLength(1);
      expect(res.body.errors.conflicts[0].cabinId).toBe(conflicting.id);

      // هیچ قاعده‌ای نباید ساخته شده باشد (atomic).
      const count = await prisma.priceRule.count({ where: { type: "discount" } });
      expect(count).toBe(2);
    });

    it("returns 404 listing the missing cabin ids", async () => {
      const res = await request(app)
        .post(`${PRICE_RULES_PATH}/bulk`)
        .set("Cookie", cookieFor(owner))
        .send({ cabinIds: [cabinId, 999_999], rule: validDateRangeBody() });

      expect(res.status).toBe(404);
      expect(res.body.errors.missingCabinIds).toEqual([999_999]);
    });
  });

  // ==================================================================
  // Concurrency
  // ==================================================================
  describe("concurrency", () => {
    it("two simultaneous rule creations cannot jointly exceed the limits", async () => {
      const today = TODAY();
      const input = {
        type: "discount" as const,
        kind: "dateRange" as const,
        percent: 30,
        startDate: today,
        endDate: addDaysUtc(today, 5),
      };

      const results = await Promise.allSettled([
        priceRuleService.createRule(cabinId, input, admin.id),
        priceRuleService.createRule(cabinId, input, admin.id),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const error = rejected[0].reason as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(409);
      expect(["PRICE_RULE_LIMIT_EXCEEDED", "TRANSACTION_CONFLICT"]).toContain(error.code);

      const activeCount = await prisma.priceRule.count({ where: { cabinId, isActive: true } });
      expect(activeCount).toBe(1);
    });
  });
});

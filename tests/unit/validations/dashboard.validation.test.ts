import { describe, it, expect } from "vitest";
import { dashboardSnapshotQuerySchema } from "../../../src/validations/dashboard.validation.js";
import { MAX_DASHBOARD_RANGE_DAYS } from "../../../src/constants/dashboard.constants.js";

const DAY_MS = 86_400_000;

/** استخراج پیام‌های خطا برای assert راحت‌تر. */
function issues(result: { success: boolean; error?: { issues: unknown[] } }) {
  return result.success
    ? []
    : (result.error!.issues as Array<{ path: unknown[]; message: string }>);
}

const parse = (query: Record<string, unknown>) =>
  dashboardSnapshotQuerySchema.safeParse(query);

describe("dashboard.validation", () => {
  const validRange = { from: "2026-06-01", to: "2026-06-30" };

  it("should accept a minimal valid query and default `compare` to prev-period", () => {
    const result = parse(validRange);
    expect(result.success).toBe(true);
    expect(result.data!.compare).toBe("prev-period");
    expect(result.data!.from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(result.data!.to.toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });

  it("should parse a CSV list of city/cabin ids into numbers", () => {
    const result = parse({ ...validRange, cityIds: "1,2,3", cabinIds: "7" });
    expect(result.success).toBe(true);
    expect(result.data!.cityIds).toEqual([1, 2, 3]);
    expect(result.data!.cabinIds).toEqual([7]);
  });

  it("should parse CSV enum lists for statuses and payment statuses", () => {
    const result = parse({
      ...validRange,
      statuses: "pending,confirmed",
      paymentStatuses: "paid,unpaid",
    });
    expect(result.success).toBe(true);
    expect(result.data!.statuses).toEqual(["pending", "confirmed"]);
    expect(result.data!.paymentStatuses).toEqual(["paid", "unpaid"]);
  });

  it("should treat an empty CSV string as `undefined` (no filter)", () => {
    const result = parse({ ...validRange, cityIds: "", statuses: "" });
    expect(result.success).toBe(true);
    expect(result.data!.cityIds).toBeUndefined();
    expect(result.data!.statuses).toBeUndefined();
  });

  it("should reject an unknown status", () => {
    const result = parse({ ...validRange, statuses: "pending,bogus" });
    expect(result.success).toBe(false);
  });

  it("should reject an unknown payment status", () => {
    expect(parse({ ...validRange, paymentStatuses: "half" }).success).toBe(false);
  });

  it("should reject a non-positive id", () => {
    expect(parse({ ...validRange, cityIds: "0,1" }).success).toBe(false);
  });

  it("should reject a non-numeric id", () => {
    expect(parse({ ...validRange, cabinIds: "abc" }).success).toBe(false);
  });

  it("should reject from > to", () => {
    const result = parse({ from: "2026-06-30", to: "2026-06-01" });
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.message.includes("before or equal"))).toBe(true);
  });

  it("should accept from === to (single day)", () => {
    expect(parse({ from: "2026-06-01", to: "2026-06-01" }).success).toBe(true);
  });

  it("should accept a range exactly at the maximum length", () => {
    const from = new Date(Date.UTC(2026, 0, 1));
    const to = new Date(from.getTime() + (MAX_DASHBOARD_RANGE_DAYS - 1) * DAY_MS);
    const result = parse({
      from: "2026-01-01",
      to: to.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
  });

  it("should reject a range longer than the maximum", () => {
    const from = new Date(Date.UTC(2026, 0, 1));
    const to = new Date(from.getTime() + MAX_DASHBOARD_RANGE_DAYS * DAY_MS);
    const result = parse({
      from: "2026-01-01",
      to: to.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
    expect(
      issues(result).some((i) => i.message.includes(String(MAX_DASHBOARD_RANGE_DAYS))),
    ).toBe(true);
  });

  it("should reject a missing range", () => {
    expect(parse({}).success).toBe(false);
  });

  it("should reject an invalid compare mode", () => {
    expect(parse({ ...validRange, compare: "prev-month" }).success).toBe(false);
  });
});

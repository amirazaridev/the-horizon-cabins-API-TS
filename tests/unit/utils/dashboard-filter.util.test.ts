import { describe, it, expect } from "vitest";
import {
  resolveStatusFilter,
  buildDashboardFilters,
} from "../../../src/utils/dashboard-filter.util.js";
import type { DashboardSnapshotQuery } from "../../../src/types/dashboard.types.js";

const baseQuery: DashboardSnapshotQuery = {
  from: new Date("2026-06-01T00:00:00.000Z"),
  to: new Date("2026-06-30T00:00:00.000Z"),
  compare: "prev-period",
};

describe("dashboard-filter.util", () => {
  describe("resolveStatusFilter", () => {
    it("should return undefined when neither filter is provided", () => {
      expect(resolveStatusFilter(undefined, undefined)).toBeUndefined();
    });

    it("should return undefined for empty arrays", () => {
      expect(resolveStatusFilter([], [])).toBeUndefined();
    });

    it("should return the statuses filter as-is when only it is provided", () => {
      expect(resolveStatusFilter(["confirmed", "pending"], undefined)).toEqual([
        "confirmed",
        "pending",
      ]);
    });

    it("should expand `paid` to its booking statuses", () => {
      expect(resolveStatusFilter(undefined, ["paid"])).toEqual([
        "confirmed",
        "checkedIn",
        "checkedOut",
      ]);
    });

    it("should expand `unpaid` to its booking statuses", () => {
      expect(resolveStatusFilter(undefined, ["unpaid"])).toEqual([
        "pending",
        "cancelled",
      ]);
    });

    it("should de-duplicate when both payment statuses are requested", () => {
      const result = resolveStatusFilter(undefined, ["paid", "unpaid"]);
      expect(result).toBeDefined();
      expect(new Set(result).size).toBe(result!.length);
      expect(result).toHaveLength(5);
    });

    it("should intersect the statuses filter with the payment filter", () => {
      expect(resolveStatusFilter(["confirmed", "cancelled"], ["paid"])).toEqual([
        "confirmed",
      ]);
    });

    it("should return an empty array when the intersection is empty", () => {
      expect(resolveStatusFilter(["cancelled"], ["paid"])).toEqual([]);
    });

    it("should not mutate the input statuses array", () => {
      const statuses = ["confirmed", "cancelled"] as const;
      const copy = [...statuses];
      resolveStatusFilter(statuses, ["paid"]);
      expect([...statuses]).toEqual(copy);
    });
  });

  describe("buildDashboardFilters", () => {
    it("should default city/cabin filters to empty arrays", () => {
      expect(buildDashboardFilters(baseQuery)).toEqual({
        cityIds: [],
        cabinIds: [],
        statuses: undefined,
      });
    });

    it("should pass through city/cabin filters and resolve statuses", () => {
      expect(
        buildDashboardFilters({
          ...baseQuery,
          cityIds: [1, 2],
          cabinIds: [5],
          paymentStatuses: ["unpaid"],
        }),
      ).toEqual({
        cityIds: [1, 2],
        cabinIds: [5],
        statuses: ["pending", "cancelled"],
      });
    });
  });
});

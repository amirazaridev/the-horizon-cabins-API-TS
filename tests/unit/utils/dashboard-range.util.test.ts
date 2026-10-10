import { describe, it, expect } from "vitest";
import {
  inclusiveDayCount,
  resolveCompareRange,
} from "../../../src/utils/dashboard-range.util.js";

const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe("dashboard-range.util", () => {
  describe("inclusiveDayCount", () => {
    it("should count both ends", () => {
      expect(inclusiveDayCount(day("2026-06-10"), day("2026-06-19"))).toBe(10);
    });

    it("should return 1 for a single day", () => {
      expect(inclusiveDayCount(day("2026-06-10"), day("2026-06-10"))).toBe(1);
    });
  });

  describe("resolveCompareRange", () => {
    it("should return null for `none`", () => {
      expect(resolveCompareRange({ from: day("2026-06-10"), to: day("2026-06-19") }, "none")).toBeNull();
    });

    it("should return the same-length period immediately before `from` (prev-period)", () => {
      const result = resolveCompareRange(
        { from: day("2026-06-10"), to: day("2026-06-19") },
        "prev-period",
      );
      expect(result).not.toBeNull();
      expect(result!.to.toISOString()).toBe("2026-06-09T00:00:00.000Z");
      expect(result!.from.toISOString()).toBe("2026-05-31T00:00:00.000Z");
      expect(inclusiveDayCount(result!.from, result!.to)).toBe(10);
    });

    it("should shift exactly 365 days back (prev-year)", () => {
      const result = resolveCompareRange(
        { from: day("2026-06-10"), to: day("2026-06-19") },
        "prev-year",
      );
      expect(result).not.toBeNull();
      expect(result!.from.toISOString()).toBe("2025-06-10T00:00:00.000Z");
      expect(result!.to.toISOString()).toBe("2025-06-19T00:00:00.000Z");
    });

    it("should keep the same length for a single-day range", () => {
      const result = resolveCompareRange(
        { from: day("2026-06-10"), to: day("2026-06-10") },
        "prev-period",
      );
      expect(result!.from.toISOString()).toBe("2026-06-09T00:00:00.000Z");
      expect(result!.to.toISOString()).toBe("2026-06-09T00:00:00.000Z");
    });

    it("should not mutate the input range", () => {
      const range = { from: day("2026-06-10"), to: day("2026-06-19") };
      resolveCompareRange(range, "prev-period");
      expect(range.from.toISOString()).toBe("2026-06-10T00:00:00.000Z");
      expect(range.to.toISOString()).toBe("2026-06-19T00:00:00.000Z");
    });
  });
});

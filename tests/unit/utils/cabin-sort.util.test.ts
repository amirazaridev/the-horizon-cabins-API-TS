import { describe, it, expect } from "vitest";
import {
  CABIN_SORT_VALUES,
  cabinOrderBy,
  cabinOrderBySql,
  isBookingCountSort,
  isPriceBasedSort,
  needsRawSortPath,
} from "../../../src/utils/cabin-sort.util.js";

describe("cabin-sort.util", () => {
  describe("CABIN_SORT_VALUES", () => {
    it("should expose every supported sort key exactly once", () => {
      expect([...CABIN_SORT_VALUES]).toEqual([
        "price_asc",
        "price_desc",
        "newest",
        "most_booked",
        "rating_desc",
      ]);
      expect(new Set(CABIN_SORT_VALUES).size).toBe(CABIN_SORT_VALUES.length);
    });
  });

  describe("isPriceBasedSort", () => {
    it("should be true only for price sorts", () => {
      expect(isPriceBasedSort("price_asc")).toBe(true);
      expect(isPriceBasedSort("price_desc")).toBe(true);
      expect(isPriceBasedSort("newest")).toBe(false);
      expect(isPriceBasedSort("most_booked")).toBe(false);
      expect(isPriceBasedSort("rating_desc")).toBe(false);
      expect(isPriceBasedSort(undefined)).toBe(false);
    });
  });

  describe("isBookingCountSort", () => {
    it("should be true only for most_booked", () => {
      expect(isBookingCountSort("most_booked")).toBe(true);
      expect(isBookingCountSort("price_asc")).toBe(false);
      expect(isBookingCountSort(undefined)).toBe(false);
    });
  });

  describe("needsRawSortPath", () => {
    it("should route price and booking-count sorts to the raw path", () => {
      expect(needsRawSortPath("price_asc")).toBe(true);
      expect(needsRawSortPath("price_desc")).toBe(true);
      expect(needsRawSortPath("most_booked")).toBe(true);
    });

    it("should keep plain-column sorts on the Prisma path", () => {
      expect(needsRawSortPath("newest")).toBe(false);
      expect(needsRawSortPath("rating_desc")).toBe(false);
      expect(needsRawSortPath(undefined)).toBe(false);
    });
  });

  describe("cabinOrderBy", () => {
    it("should sort newest by createdAt desc with id tie-breaker", () => {
      expect(cabinOrderBy("newest")).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    });

    it("should sort rating_desc by rating desc with id tie-breaker", () => {
      expect(cabinOrderBy("rating_desc")).toEqual([{ rating: "desc" }, { id: "asc" }]);
    });

    it("should default to id asc for price/booking sorts and undefined", () => {
      expect(cabinOrderBy("price_asc")).toEqual([{ id: "asc" }]);
      expect(cabinOrderBy("most_booked")).toEqual([{ id: "asc" }]);
      expect(cabinOrderBy(undefined)).toEqual([{ id: "asc" }]);
    });
  });

  describe("cabinOrderBySql", () => {
    it("should build the expected ORDER BY clause for each sort", () => {
      expect(cabinOrderBySql("price_asc").sql).toContain('ORDER BY "sortPrice" ASC');
      expect(cabinOrderBySql("price_desc").sql).toContain('ORDER BY "sortPrice" DESC');
      expect(cabinOrderBySql("most_booked").sql).toContain('ORDER BY "bookingCount" DESC');
      expect(cabinOrderBySql("newest").sql).toContain('ORDER BY c."created_at" DESC');
      expect(cabinOrderBySql("rating_desc").sql).toContain('ORDER BY c."rating" DESC');
      expect(cabinOrderBySql(undefined).sql).toContain('ORDER BY c."id" ASC');
    });
  });
});

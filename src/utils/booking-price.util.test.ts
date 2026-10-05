import { describe, it, expect } from "vitest";
import {
  calculateCabinPrice,
  calculateTotalPrice,
  fitsInt32,
  sumNightPrices,
  MAX_INT32,
} from "./booking-price.util.js";

describe("booking-price.util", () => {
  describe("sumNightPrices", () => {
    it("should sum nightly prices", () => {
      expect(sumNightPrices([1_000_000, 1_000_000, 1_000_000])).toBe(3_000_000);
    });

    it("should return 0 for an empty list", () => {
      expect(sumNightPrices([])).toBe(0);
    });

    it("should return null when the sum overflows Int32", () => {
      expect(sumNightPrices([MAX_INT32, 1])).toBeNull();
    });

    it("should allow a sum exactly at Int32 max", () => {
      expect(sumNightPrices([MAX_INT32])).toBe(MAX_INT32);
    });
  });

  describe("fitsInt32", () => {
    it("should accept values within range", () => {
      expect(fitsInt32(0)).toBe(true);
      expect(fitsInt32(MAX_INT32)).toBe(true);
    });

    it("should reject overflow, negatives and non-integers", () => {
      expect(fitsInt32(MAX_INT32 + 1)).toBe(false);
      expect(fitsInt32(-1)).toBe(false);
      expect(fitsInt32(1.5)).toBe(false);
    });
  });

  // TODO(P7): این helperهای قدیمی با حذف کامل مسیر قدیمی حذف می‌شوند.
  describe("calculateCabinPrice (legacy)", () => {
    it("should apply discount correctly", () => {
      expect(calculateCabinPrice(100000, 10)).toBe(90000);
    });

    it("should return full price when discount is 0", () => {
      expect(calculateCabinPrice(100000, 0)).toBe(100000);
    });
  });

  describe("calculateTotalPrice (legacy)", () => {
    it("should calculate total price correctly", () => {
      expect(calculateTotalPrice(90000, 2)).toBe(180000);
    });
  });
});

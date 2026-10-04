import { describe, it, expect } from "vitest";
import { calculateCabinPrice, calculateTotalPrice } from "../../../src/utils/booking-price.util.js";

describe("booking-price.util", () => {
  describe("calculateCabinPrice", () => {
    it("should return the full price when the discount is 0", () => {
      expect(calculateCabinPrice(100_000, 0)).toBe(100_000);
    });

    it("should apply a 10% discount", () => {
      expect(calculateCabinPrice(100_000, 10)).toBe(90_000);
    });

    it("should floor fractional results", () => {
      // 99999 * 0.9 = 89999.1 → floor = 89999
      expect(calculateCabinPrice(99_999, 10)).toBe(89_999);
    });

    it("should floor a half-cent result downward", () => {
      // 1000 - 10 = 990 دقیق؛ برای اعشاری: 333 با 10% → 299.7 → 299
      expect(calculateCabinPrice(333, 10)).toBe(299);
    });

    it("should return 0 for a 100% discount", () => {
      expect(calculateCabinPrice(100_000, 100)).toBe(0);
    });

    it("should never return a negative value for a discount above 100", () => {
      expect(calculateCabinPrice(100_000, 150)).toBe(0);
    });

    it("should handle a zero regular price", () => {
      expect(calculateCabinPrice(0, 10)).toBe(0);
    });
  });

  describe("calculateTotalPrice", () => {
    it("should multiply the nightly price by the number of nights", () => {
      expect(calculateTotalPrice(90_000, 2)).toBe(180_000);
    });

    it("should return 0 for zero nights", () => {
      expect(calculateTotalPrice(90_000, 0)).toBe(0);
    });

    it("should return a number (not BigInt) consistent with the Prisma Int column", () => {
      const result = calculateTotalPrice(100_000, 1);
      expect(typeof result).toBe("number");
      expect(result).toBe(100_000);
    });
  });
});

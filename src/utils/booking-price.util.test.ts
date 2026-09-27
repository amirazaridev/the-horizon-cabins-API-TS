import { describe, it, expect } from "vitest";
import {
  calculateNumNights,
  calculateCabinPrice,
  calculateTotalPrice,
} from "./booking-price.util.js";

describe("booking-price.util", () => {
  describe("calculateNumNights", () => {
    it("should calculate correct number of nights", () => {
      expect(calculateNumNights(new Date("2025-06-20"), new Date("2025-06-22"))).toBe(2);
    });

    it("should return 1 for single night", () => {
      expect(calculateNumNights(new Date("2025-06-20"), new Date("2025-06-21"))).toBe(1);
    });

    it("should handle month boundaries", () => {
      expect(calculateNumNights(new Date("2025-06-28"), new Date("2025-07-02"))).toBe(4);
    });
  });

  describe("calculateCabinPrice", () => {
    it("should apply discount correctly", () => {
      expect(calculateCabinPrice(100000, 10)).toBe(90000);
    });

    it("should return full price when discount is 0", () => {
      expect(calculateCabinPrice(100000, 0)).toBe(100000);
    });

    it("should round down", () => {
      expect(calculateCabinPrice(99999, 10)).toBe(89999);
    });

    it("should handle 100% discount", () => {
      expect(calculateCabinPrice(100000, 100)).toBe(0);
    });
  });

  describe("calculateTotalPrice", () => {
    it("should calculate total price correctly", () => {
      expect(calculateTotalPrice(90000, 2)).toBe(BigInt(180000));
    });

    it("should return BigInt", () => {
      expect(typeof calculateTotalPrice(100000, 1)).toBe("bigint");
    });
  });
});

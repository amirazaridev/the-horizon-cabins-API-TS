import { describe, it, expect } from "vitest";
import { isValidStatusTransition, hasFullBookingAccess } from "../../../src/utils/booking.util.js";
import type { BookingStatus } from "../../../src/generated/prisma/enums.js";

describe("booking.util", () => {
  describe("isValidStatusTransition", () => {
    const allowed: Array<[BookingStatus, BookingStatus]> = [
      ["pending", "cancelled"],
      ["confirmed", "checkedIn"],
      ["confirmed", "cancelled"],
      ["checkedIn", "checkedOut"],
    ];

    it.each(allowed)("should allow %s → %s", (from, to) => {
      expect(isValidStatusTransition(from, to)).toBe(true);
    });

    // ماتریس کامل همه‌ی ترکیب‌ها (۵×۵ = ۲۵) — نفیِ allowed باید false باشد.
    const allStatuses: BookingStatus[] = [
      "pending",
      "confirmed",
      "cancelled",
      "checkedIn",
      "checkedOut",
    ];
    const allowedSet = new Set(allowed.map(([f, t]) => `${f}->${t}`));

    const forbidden = allStatuses.flatMap((from) =>
      allStatuses
        .filter((to) => !allowedSet.has(`${from}->${to}`))
        .map((to) => [from, to] as [BookingStatus, BookingStatus]),
    );

    it.each(forbidden)("should reject %s → %s", (from, to) => {
      expect(isValidStatusTransition(from, to)).toBe(false);
    });

    it("should treat cancelled as terminal (no outgoing transitions)", () => {
      for (const target of allStatuses) {
        expect(isValidStatusTransition("cancelled", target)).toBe(false);
      }
    });

    it("should treat checkedOut as terminal (no outgoing transitions)", () => {
      for (const target of allStatuses) {
        expect(isValidStatusTransition("checkedOut", target)).toBe(false);
      }
    });

    it("should not allow a transition to the same status", () => {
      for (const status of allStatuses) {
        expect(isValidStatusTransition(status, status)).toBe(false);
      }
    });
  });

  describe("hasFullBookingAccess", () => {
    it("should grant full access to admin", () => {
      expect(hasFullBookingAccess("admin")).toBe(true);
    });

    it("should grant full access to owner", () => {
      expect(hasFullBookingAccess("owner")).toBe(true);
    });

    it("should deny full access to guest", () => {
      expect(hasFullBookingAccess("guest")).toBe(false);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  createBookingSchema,
  listBookingsQueryValidation,
  updateBookingStatusSchema,
  bookedDatesSchema,
  getBookingSchema,
} from "../../../src/validations/booking.validation.js";
import { BOOKING_CONSTANTS } from "../../../src/constants/booking.constants.js";
import { currentSettings } from "../../../src/services/setting.store.js";

const DAY_MS = 86_400_000;

/** استخراج پیام‌های خطا از نتیجه‌ی safeParse برای assert راحت‌تر. */
function issues(result: { success: boolean; error?: { issues: unknown[] } }) {
  return result.success
    ? []
    : (result.error!.issues as Array<{ path: unknown[]; message: string }>);
}

describe("booking.validation", () => {
  describe("dateOnlySchema (via createBookingSchema)", () => {
    const base = { cabinId: 1, numGuests: 2 };

    it("should accept a valid YYYY-MM-DD string and transform it to a UTC midnight Date", () => {
      const result = createBookingSchema.body.safeParse({
        ...base,
        startDate: "2026-06-01",
        endDate: "2026-06-03",
      });

      expect(result.success).toBe(true);
      expect(result.data!.startDate.toISOString()).toBe("2026-06-01T00:00:00.000Z");
      expect(result.data!.endDate.toISOString()).toBe("2026-06-03T00:00:00.000Z");
    });

    it("should reject a non-date string", () => {
      const result = createBookingSchema.body.safeParse({
        ...base,
        startDate: "not-a-date",
        endDate: "2026-06-03",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a non-existent calendar date (2026-02-30)", () => {
      const result = createBookingSchema.body.safeParse({
        ...base,
        startDate: "2026-02-30",
        endDate: "2026-03-03",
      });
      expect(result.success).toBe(false);
      expect(issues(result).some((i) => i.message === "Invalid calendar date")).toBe(true);
    });

    it("should reject an invalid month (2026-13-01)", () => {
      const result = createBookingSchema.body.safeParse({
        ...base,
        startDate: "2026-13-01",
        endDate: "2026-06-03",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a full ISO datetime string", () => {
      const result = createBookingSchema.body.safeParse({
        ...base,
        startDate: "2026-06-01T10:00:00.000Z",
        endDate: "2026-06-03",
      });
      expect(result.success).toBe(false);
      expect(issues(result).some((i) => i.message.includes("YYYY-MM-DD"))).toBe(true);
    });

    it("should reject a date with a one-digit month", () => {
      const result = createBookingSchema.body.safeParse({
        ...base,
        startDate: "2026-6-01",
        endDate: "2026-06-03",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createBookingSchema", () => {
    const valid = {
      cabinId: 5,
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      numGuests: 2,
    };

    it("should accept a valid body", () => {
      expect(createBookingSchema.body.safeParse(valid).success).toBe(true);
    });

    it("should coerce string numbers (query-string style) for cabinId and numGuests", () => {
      const result = createBookingSchema.body.safeParse({
        cabinId: "5",
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        numGuests: "2",
      });
      expect(result.success).toBe(true);
      expect(result.data!.cabinId).toBe(5);
      expect(result.data!.numGuests).toBe(2);
    });

    it("should reject a missing cabinId", () => {
      const { cabinId, ...rest } = valid;
      void cabinId;
      expect(createBookingSchema.body.safeParse(rest).success).toBe(false);
    });

    it("should reject a non-positive numGuests", () => {
      expect(createBookingSchema.body.safeParse({ ...valid, numGuests: 0 }).success).toBe(false);
    });

    it("should reject a fractional numGuests", () => {
      expect(createBookingSchema.body.safeParse({ ...valid, numGuests: 1.5 }).success).toBe(false);
    });

    it("should reject observations longer than 2000 characters", () => {
      const result = createBookingSchema.body.safeParse({
        ...valid,
        observations: "x".repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it("should accept observations of exactly 2000 characters", () => {
      const result = createBookingSchema.body.safeParse({
        ...valid,
        observations: "x".repeat(2000),
      });
      expect(result.success).toBe(true);
    });

    it("should trim observations", () => {
      const result = createBookingSchema.body.safeParse({
        ...valid,
        observations: "  hello  ",
      });
      expect(result.success).toBe(true);
      expect(result.data!.observations).toBe("hello");
    });

    it("should allow observations to be omitted", () => {
      const result = createBookingSchema.body.safeParse(valid);
      expect(result.success).toBe(true);
      expect(result.data!.observations).toBeUndefined();
    });
  });

  describe("listBookingsQueryValidation", () => {
    it("should apply pagination defaults", () => {
      const result = listBookingsQueryValidation.query.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ page: 1, limit: 10 });
    });

    it("should accept every filter", () => {
      const result = listBookingsQueryValidation.query.safeParse({
        page: "2",
        limit: "20",
        status: "confirmed",
        cabinId: "3",
        guestId: "7",
        startDateFrom: "2026-06-01",
        startDateTo: "2026-06-30",
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        page: 2,
        limit: 20,
        status: "confirmed",
        cabinId: 3,
        guestId: 7,
      });
    });

    it.each(["pending", "confirmed", "cancelled", "checkedIn", "checkedOut"])(
      "should accept the valid status %s",
      (status) => {
        expect(listBookingsQueryValidation.query.safeParse({ status }).success).toBe(true);
      },
    );

    it("should reject an invalid status", () => {
      expect(listBookingsQueryValidation.query.safeParse({ status: "bogus" }).success).toBe(false);
    });

    it("should reject a limit above 100", () => {
      expect(listBookingsQueryValidation.query.safeParse({ limit: "101" }).success).toBe(false);
    });

    it("should reject a non-positive page", () => {
      expect(listBookingsQueryValidation.query.safeParse({ page: "0" }).success).toBe(false);
    });
  });

  describe("updateBookingStatusSchema", () => {
    it.each(["checkedIn", "checkedOut", "cancelled"])(
      "should accept the updatable status %s",
      (status) => {
        const result = updateBookingStatusSchema.body.safeParse({ status });
        expect(result.success).toBe(true);
        expect(result.data!.status).toBe(status);
      },
    );

    it.each(["pending", "confirmed"])("should reject the non-updatable status %s", (status) => {
      expect(updateBookingStatusSchema.body.safeParse({ status }).success).toBe(false);
    });

    it("should reject a missing status", () => {
      expect(updateBookingStatusSchema.body.safeParse({}).success).toBe(false);
    });
  });

  describe("bookedDatesSchema", () => {
    const parse = (query: Record<string, unknown>) =>
      bookedDatesSchema(currentSettings()).query.safeParse(query);

    it("should accept an empty query", () => {
      expect(parse({}).success).toBe(true);
    });

    it("should accept a valid range", () => {
      const result = parse({ from: "2026-06-01", to: "2026-06-10" });
      expect(result.success).toBe(true);
      expect(result.data!.from).toEqual(new Date("2026-06-01T00:00:00.000Z"));
      expect(result.data!.to).toEqual(new Date("2026-06-10T00:00:00.000Z"));
    });

    it("should reject from > to", () => {
      const result = parse({ from: "2026-06-10", to: "2026-06-01" });
      expect(result.success).toBe(false);
      expect(issues(result).some((i) => i.message.includes("before or equal"))).toBe(true);
    });

    it("should accept from === to (zero-length range)", () => {
      expect(parse({ from: "2026-06-01", to: "2026-06-01" }).success).toBe(true);
    });

    it("should accept a range exactly at the maximum length", () => {
      const from = new Date(Date.UTC(2026, 0, 1));
      const to = new Date(from.getTime() + BOOKING_CONSTANTS.BOOKED_DATES_MAX_RANGE_DAYS * DAY_MS);
      const result = parse({ from: "2026-01-01", to: to.toISOString().slice(0, 10) });
      expect(result.success).toBe(true);
    });

    it("should reject a range longer than BOOKED_DATES_MAX_RANGE_DAYS", () => {
      const from = new Date(Date.UTC(2026, 0, 1));
      const to = new Date(
        from.getTime() + (BOOKING_CONSTANTS.BOOKED_DATES_MAX_RANGE_DAYS + 1) * DAY_MS,
      );
      const result = parse({ from: "2026-01-01", to: to.toISOString().slice(0, 10) });
      expect(result.success).toBe(false);
      expect(
        issues(result).some((i) =>
          i.message.includes(String(BOOKING_CONSTANTS.BOOKED_DATES_MAX_RANGE_DAYS)),
        ),
      ).toBe(true);
    });

    it("should transform the cabinId param to a number", () => {
      const result = bookedDatesSchema(currentSettings()).params.safeParse({ cabinId: "12" });
      expect(result.success).toBe(true);
      expect(result.data!.cabinId).toBe(12);
    });

    it("should reject a non-numeric cabinId param", () => {
      expect(
        bookedDatesSchema(currentSettings()).params.safeParse({ cabinId: "abc" }).success,
      ).toBe(false);
    });
  });

  describe("idParamsSchema (getBookingSchema)", () => {
    it("should coerce a numeric id", () => {
      const result = getBookingSchema.params.safeParse({ id: "42" });
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(42);
    });

    it("should reject a non-numeric id", () => {
      const result = getBookingSchema.params.safeParse({ id: "4a2" });
      expect(result.success).toBe(false);
    });
  });
});

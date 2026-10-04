import { describe, it, expect } from "vitest";
import { todayInTimezone, nightsBetween, addDaysUtc } from "../../../src/utils/date.util.js";

describe("date.util", () => {
  describe("todayInTimezone", () => {
    it("should return midnight UTC of the current day in the given timezone", () => {
      // 2026-10-03T20:30:00Z => در Asia/Tehran 00:00 روز بعد (UTC+3:30) است.
      const now = new Date("2026-10-03T20:30:00.000Z");
      expect(todayInTimezone("Asia/Tehran", now).toISOString()).toBe("2026-10-04T00:00:00.000Z");
    });

    it("should return the same calendar day just before the Tehran midnight boundary", () => {
      // 2026-10-03T20:29:59Z => در Asia/Tehran هنوز 2026-10-03 است.
      const now = new Date("2026-10-03T20:29:59.000Z");
      expect(todayInTimezone("Asia/Tehran", now).toISOString()).toBe("2026-10-03T00:00:00.000Z");
    });

    it("should resolve another timezone independently of the boundary above (UTC)", () => {
      const now = new Date("2026-10-03T20:30:00.000Z");
      expect(todayInTimezone("UTC", now).toISOString()).toBe("2026-10-03T00:00:00.000Z");
    });

    it("should resolve a negative-offset timezone (America/New_York) correctly", () => {
      // 2026-10-03T02:00:00Z => در New York (UTC-4 در DST اکتبر) هنوز 2026-10-02 است.
      const now = new Date("2026-10-03T02:00:00.000Z");
      expect(todayInTimezone("America/New_York", now).toISOString()).toBe(
        "2026-10-02T00:00:00.000Z",
      );
    });

    it("should default `now` to the real current date when omitted", () => {
      const result = todayInTimezone("UTC");
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
    });
  });

  describe("nightsBetween", () => {
    it("should count nights between two UTC midnights", () => {
      expect(nightsBetween(new Date("2025-06-20T00:00:00.000Z"), new Date("2025-06-22T00:00:00.000Z"))).toBe(
        2,
      );
    });

    it("should return 1 for a single night", () => {
      expect(nightsBetween(new Date("2025-06-20T00:00:00.000Z"), new Date("2025-06-21T00:00:00.000Z"))).toBe(
        1,
      );
    });

    it("should be timezone/DST-safe because both dates are UTC midnights", () => {
      // بازه‌ای که در بسیاری از مناطق با تغییر ساعت تابستانی تلاقی دارد؛
      // چون هر دو نیمه‌شب UTC‌اند، باید دقیقاً «۳» باشد.
      const start = new Date("2026-03-28T00:00:00.000Z");
      const end = new Date("2026-03-31T00:00:00.000Z");
      expect(nightsBetween(start, end)).toBe(3);
    });

    it("should be negative when end is before start", () => {
      expect(nightsBetween(new Date("2025-06-22T00:00:00.000Z"), new Date("2025-06-20T00:00:00.000Z"))).toBe(
        -2,
      );
    });
  });

  describe("addDaysUtc", () => {
    it("should add days within the same month", () => {
      expect(addDaysUtc(new Date("2025-06-10T00:00:00.000Z"), 5).toISOString()).toBe(
        "2025-06-15T00:00:00.000Z",
      );
    });

    it("should roll over to the next month", () => {
      expect(addDaysUtc(new Date("2025-06-28T00:00:00.000Z"), 5).toISOString()).toBe(
        "2025-07-03T00:00:00.000Z",
      );
    });

    it("should roll over to the next year", () => {
      expect(addDaysUtc(new Date("2025-12-30T00:00:00.000Z"), 3).toISOString()).toBe(
        "2026-01-02T00:00:00.000Z",
      );
    });

    it("should support negative days", () => {
      expect(addDaysUtc(new Date("2025-06-10T00:00:00.000Z"), -5).toISOString()).toBe(
        "2025-06-05T00:00:00.000Z",
      );
    });

    it("should not mutate the input date", () => {
      const input = new Date("2025-06-10T00:00:00.000Z");
      addDaysUtc(input, 10);
      expect(input.toISOString()).toBe("2025-06-10T00:00:00.000Z");
    });

    it("should handle a leap day (Feb 29) correctly", () => {
      expect(addDaysUtc(new Date("2024-02-28T00:00:00.000Z"), 1).toISOString()).toBe(
        "2024-02-29T00:00:00.000Z",
      );
      expect(addDaysUtc(new Date("2024-02-29T00:00:00.000Z"), 1).toISOString()).toBe(
        "2024-03-01T00:00:00.000Z",
      );
    });

    it("should be independent of the server timezone (late-evening UTC date)", () => {
      // اگر implementation از setDate محلی استفاده می‌کرد، در timezoneهای منفی
      // ممکن بود روز جابه‌جا شود. با setUTCDate باید دقیقاً ۳۶۵ روز جلو برود.
      const start = new Date("2026-01-01T23:30:00.000Z");
      expect(addDaysUtc(start, 365).toISOString()).toBe("2027-01-01T23:30:00.000Z");
    });
  });
});

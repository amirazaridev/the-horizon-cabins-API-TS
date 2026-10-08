import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "../../../src/generated/prisma/client.js";
import { prisma } from "../../../src/config/database.js";
import * as bookingService from "../../../src/services/booking.service.js";
import * as bookingRepository from "../../../src/repositories/booking.repository.js";
import * as cabinRepository from "../../../src/repositories/cabin.repository.js";
import * as guestRepository from "../../../src/repositories/guest.repository.js";
import * as priceRuleRepository from "../../../src/repositories/price-rule.repository.js";
import { ErrorCode } from "../../../src/constants/errorCodes.js";
import { HTTP_STATUS } from "../../../src/constants/httpStatus.js";
import { TIMEZONE } from "../../../src/constants/booking.constants.js";
import { DEFAULT_SETTINGS } from "../../../src/constants/setting.constants.js";
import { AppError } from "../../../src/utils/AppError.js";
import { addDaysUtc, todayInTimezone } from "../../../src/utils/date.util.js";
import { utcDate } from "../../helpers/factories.js";

// repositoryها mock می‌شوند؛ تست‌های unit نباید به دیتابیس بزنند.
vi.mock("../../../src/repositories/booking.repository.js");
vi.mock("../../../src/repositories/cabin.repository.js");
vi.mock("../../../src/repositories/guest.repository.js");
vi.mock("../../../src/repositories/price-rule.repository.js");

// prisma.$transaction فقط برای اجرای callback تراکنش mock می‌شود.
vi.mock("../../../src/config/database.js", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

const USER_ID = 1;
const NOW = new Date("2026-06-15T12:00:00.000Z");

/** «امروز» در timezone کابین برای لحظه‌ی NOW. */
const TODAY = todayInTimezone(TIMEZONE, NOW);

/** خطای واقعی Prisma برای شبیه‌سازی P2034. */
function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("serialization failure", {
    code: "P2034",
    clientVersion: "7.0.0-test",
  });
}

/** پیش‌فرض‌های مشترک mockها. */
function stubDefaults() {
  vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue({
    id: 10,
    userId: USER_ID,
  } as never);
  vi.mocked(cabinRepository.findCabinById).mockResolvedValue({
    id: 1,
    maxCapacity: 4,
    regularPrice: 1_000_000,
  } as never);
  vi.mocked(priceRuleRepository.findActiveRulesForCabin).mockResolvedValue([] as never);
  vi.mocked(bookingRepository.hasOverlappingBooking).mockResolvedValue(false);
  vi.mocked(bookingRepository.countPendingBookingsForGuest).mockResolvedValue(0);
  vi.mocked(bookingRepository.createBooking).mockResolvedValue({
    id: 1,
    status: "pending",
  } as never);
  vi.mocked(bookingRepository.createBookingNights).mockResolvedValue(0);
  vi.mocked(bookingRepository.expirePendingBookings).mockResolvedValue(0);
}

/** رزرو پایه‌ی معتبر (۳۰ شب حداکثر؛ ۲ شب). */
const validInput = {
  cabinId: 1,
  startDate: utcDate("2026-06-16"),
  endDate: utcDate("2026-06-18"),
  numGuests: 2,
};

describe("booking.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    stubDefaults();

    // اجرای واقعی callback تراکنش با یک txmock.
    const txStub = {};
    vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) =>
      callback(txStub)) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // createBooking
  // ------------------------------------------------------------------
  describe("createBooking", () => {
    it("should create a pending booking with the right price, nights and deadline", async () => {
      await bookingService.createBooking(validInput, USER_ID);

      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: validInput.startDate,
          endDate: validInput.endDate,
          numNights: 2,
          numGuests: 2,
          //* بدون قاعده: cabinPrice = جمع کل اقامت (subtotal)، نه قیمت یک شب.
          cabinPrice: 2_000_000,
          totalPrice: 2_000_000,
          status: "pending",
          paymentDeadline: new Date(
            NOW.getTime() + DEFAULT_SETTINGS.paymentDeadlineMinutes * 60_000,
          ),
          cabin: { connect: { id: 1 } },
          guest: { connect: { id: 10 } },
        }),
        expect.anything(),
      );
    });

    it("should write one immutable BookingNight snapshot row per night", async () => {
      await bookingService.createBooking(validInput, USER_ID);

      const [bookingId, nights] = vi.mocked(bookingRepository.createBookingNights).mock.calls[0];
      expect(bookingId).toBe(1);
      expect(nights).toHaveLength(2);
      expect(nights[0]).toMatchObject({
        date: validInput.startDate,
        basePrice: 1_000_000,
        discountPercent: 0,
        surchargePercent: 0,
        finalPrice: 1_000_000,
      });
      expect(nights[1].date.getTime()).toBe(utcDate("2026-06-17").getTime());
    });

    it("should apply active rules through the engine when computing nightly prices", async () => {
      vi.mocked(priceRuleRepository.findActiveRulesForCabin).mockResolvedValue([
        {
          id: 7,
          type: "discount",
          kind: "dateRange",
          percent: 20,
          startDate: validInput.startDate,
          endDate: addDaysUtc(validInput.startDate, 10),
          weekdays: [],
          isActive: true,
          label: "تخفیف ویژه",
        },
      ] as never);

      await bookingService.createBooking(validInput, USER_ID);

      //* 20% تخفیف روی ۱٬۰۰۰٬۰۰۰ → ۸۰۰٬۰۰۰ برای هر شب، جمع ۱٬۶۰۰٬۰۰۰.
      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ cabinPrice: 1_600_000, totalPrice: 1_600_000 }),
        expect.anything(),
      );
      const [, nights] = vi.mocked(bookingRepository.createBookingNights).mock.calls[0];
      expect(nights[0].discountPercent).toBe(20);
      expect(nights[0].finalPrice).toBe(800_000);
    });

    it("should reject with 409 PRICE_CHANGED when expectedTotalPrice mismatches", async () => {
      await expect(
        bookingService.createBooking({ ...validInput, expectedTotalPrice: 999 }, USER_ID),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.PRICE_CHANGED,
      });
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it("should accept a matching expectedTotalPrice", async () => {
      await expect(
        bookingService.createBooking({ ...validInput, expectedTotalPrice: 2_000_000 }, USER_ID),
      ).resolves.toBeDefined();
      expect(bookingRepository.createBooking).toHaveBeenCalled();
    });

    it("should reject when the guest profile does not exist", async () => {
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(null);

      await expect(bookingService.createBooking(validInput, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: ErrorCode.FORBIDDEN,
      });
      expect(cabinRepository.findCabinById).not.toHaveBeenCalled();
    });

    it("should reject a start date in the past", async () => {
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: utcDate("2026-06-01"), endDate: utcDate("2026-06-03") },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should allow a start date equal to today in the cabin timezone", async () => {
      const tomorrow = addDaysUtc(TODAY, 1);
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: TODAY, endDate: tomorrow },
          USER_ID,
        ),
      ).resolves.toBeDefined();
    });

    it("should reject yesterday (relative to the cabin timezone) but allow today", async () => {
      const yesterday = addDaysUtc(TODAY, -1);
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: yesterday, endDate: TODAY },
          USER_ID,
        ),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_INVALID_DATE_RANGE });
    });

    it("should reject a start date beyond MAX_ADVANCE_BOOKING_DAYS", async () => {
      const tooFar = addDaysUtc(TODAY, DEFAULT_SETTINGS.maxAdvanceBookingDays + 1);

      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: tooFar, endDate: addDaysUtc(tooFar, 2) },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should accept an end date exactly at MAX_ADVANCE_BOOKING_DAYS", async () => {
      //* قاعده‌ی افق روی endDate است: آخرین شب = today + 119؛ پس یک شب با
      //* endDate = today + 120 (شبِ today + 119) مجاز است.
      const boundaryEnd = addDaysUtc(TODAY, DEFAULT_SETTINGS.maxAdvanceBookingDays);

      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: addDaysUtc(boundaryEnd, -1), endDate: boundaryEnd },
          USER_ID,
        ),
      ).resolves.toBeDefined();
    });

    it("should reject an end date beyond MAX_ADVANCE_BOOKING_DAYS", async () => {
      const tooFarEnd = addDaysUtc(TODAY, DEFAULT_SETTINGS.maxAdvanceBookingDays + 1);

      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: addDaysUtc(tooFarEnd, -1), endDate: tooFarEnd },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should reject an end date equal to the start date", async () => {
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: utcDate("2026-06-16"), endDate: utcDate("2026-06-16") },
          USER_ID,
        ),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_INVALID_DATE_RANGE });
    });

    it("should reject when numNights exceeds the maximum", async () => {
      const start = utcDate("2026-06-16");
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: start, endDate: addDaysUtc(start, 31) },
          USER_ID,
        ),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_INVALID_DATE_RANGE });
    });

    it("should reject when numNights is below the minimum", async () => {
      // مینیمم ۱ شب است؛ پایان باید اکیداً بعد از شروع باشد، پس ۰ شب ممکن نیست.
      // برای رسیدن به این گارد، از endDate قبل از startDate استفاده می‌کنیم
      // که اول گارد endDate > startDate را می‌زند؛ بنابراین این سناریو با
      // پیکربندی فعلی از طریق همان گارد پوشش داده می‌شود.
      const start = utcDate("2026-06-16");
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: start, endDate: addDaysUtc(start, -1) },
          USER_ID,
        ),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_INVALID_DATE_RANGE });
    });

    it("should reject an unknown cabin", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(null);

      await expect(bookingService.createBooking(validInput, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it("should reject numGuests above min(maxCapacity, maxGuestsPerBooking)", async () => {
      // ظرفیت کابین ۴ است → سقف ۴ (چون maxGuestsPerBooking=10).
      await expect(
        bookingService.createBooking({ ...validInput, numGuests: 5 }, USER_ID),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_GUEST_CAPACITY_EXCEEDED,
      });
    });

    it("should use maxGuestsPerBooking when it is smaller than maxCapacity", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue({
        id: 1,
        maxCapacity: 50,
        regularPrice: 1_000_000,
      } as never);

      // maxGuestsPerBooking = 10 → 11 مهمان باید رد شود.
      await expect(
        bookingService.createBooking({ ...validInput, numGuests: 11 }, USER_ID),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_GUEST_CAPACITY_EXCEEDED });
    });

    it("should reject when the dates overlap an existing booking", async () => {
      vi.mocked(bookingRepository.hasOverlappingBooking).mockResolvedValue(true);

      await expect(bookingService.createBooking(validInput, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_DATE_OVERLAP,
      });
      expect(bookingRepository.createBooking).not.toHaveBeenCalled();
    });

    it("should reject when the guest reached the pending booking limit", async () => {
      vi.mocked(bookingRepository.countPendingBookingsForGuest).mockResolvedValue(
        DEFAULT_SETTINGS.maxPendingBookingsPerGuest,
      );

      await expect(bookingService.createBooking(validInput, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_PENDING_LIMIT_EXCEEDED,
      });
    });

    it("should call the transaction steps in order: expire → overlap → pending → create", async () => {
      const calls: string[] = [];
      vi.mocked(bookingRepository.expirePendingBookings).mockImplementation(async () => {
        calls.push("expire");
        return 0;
      });
      vi.mocked(bookingRepository.hasOverlappingBooking).mockImplementation(async () => {
        calls.push("overlap");
        return false;
      });
      vi.mocked(bookingRepository.countPendingBookingsForGuest).mockImplementation(async () => {
        calls.push("pending");
        return 0;
      });
      vi.mocked(bookingRepository.createBooking).mockImplementation(async () => {
        calls.push("create");
        return { id: 1 } as never;
      });

      await bookingService.createBooking(validInput, USER_ID);

      expect(calls).toEqual(["expire", "overlap", "pending", "create"]);
    });

    it("should pass a single `now` to expirePendingBookings, hasOverlappingBooking and countPendingBookingsForGuest", async () => {
      await bookingService.createBooking(validInput, USER_ID);

      const expireNow = vi.mocked(bookingRepository.expirePendingBookings).mock.calls[0][0];
      const overlapNow = vi.mocked(bookingRepository.hasOverlappingBooking).mock.calls[0][3];
      const pendingNow = vi.mocked(bookingRepository.countPendingBookingsForGuest).mock.calls[0][0];

      expect(expireNow.getTime()).toBe(NOW.getTime());
      expect(overlapNow.getTime()).toBe(NOW.getTime());
      expect(pendingNow.getTime()).toBe(NOW.getTime());
      // همه یک نمونه‌ی Date هستند (نه صرفاً هم‌مقدار).
      expect(overlapNow).toBe(expireNow);
      expect(pendingNow).toBe(expireNow);
    });

    it("should pass the cabinId to expirePendingBookings and the guest id to the pending count", async () => {
      await bookingService.createBooking(validInput, USER_ID);

      expect(bookingRepository.expirePendingBookings).toHaveBeenCalledWith(
        expect.any(Date),
        { cabinId: 1 },
        expect.anything(),
      );
      expect(bookingRepository.countPendingBookingsForGuest).toHaveBeenCalledWith(
        expect.any(Date),
        10,
        expect.anything(),
      );
    });

    it("should retry on P2034 and resolve on a later attempt", async () => {
      let attempt = 0;
      vi.mocked(prisma.$transaction).mockImplementation((async (
        callback: (tx: unknown) => unknown,
      ) => {
        attempt += 1;
        if (attempt === 1) throw p2034();
        return callback({});
      }) as never);

      const promise = bookingService.createBooking(validInput, USER_ID);
      await vi.advanceTimersByTimeAsync(200);

      await expect(promise).resolves.toMatchObject({ id: 1 });
      expect(attempt).toBe(2);
    });

    it("should reject with P2034 after exhausting the retries", async () => {
      const error = p2034();
      vi.mocked(prisma.$transaction).mockRejectedValue(error);

      const promise = bookingService.createBooking(validInput, USER_ID);
      // هندلر rejection را فوراً می‌چسبانیم تا unhandled نشود.
      const settled = promise.then(
        () => "resolved",
        (e: unknown) => e,
      );
      await vi.advanceTimersByTimeAsync(1000);

      await expect(settled).resolves.toBe(error);
      // retries=2 → ۳ تلاش کل.
      expect(vi.mocked(prisma.$transaction).mock.calls.length).toBe(3);
    });

    it("should NOT retry a non-P2034 error thrown from the transaction", async () => {
      const overlap = new AppError(
        "Cabin is not available for the selected dates",
        HTTP_STATUS.CONFLICT,
        ErrorCode.BOOKING_DATE_OVERLAP,
      );
      vi.mocked(prisma.$transaction).mockRejectedValue(overlap);

      const promise = bookingService.createBooking(validInput, USER_ID);
      const settled = promise.then(
        () => "resolved",
        (e: unknown) => e,
      );
      await vi.advanceTimersByTimeAsync(1000);

      await expect(settled).resolves.toBe(overlap);
      expect(vi.mocked(prisma.$transaction).mock.calls.length).toBe(1);
    });
  });

  // ------------------------------------------------------------------
  // getAllBookings
  // ------------------------------------------------------------------
  describe("getAllBookings", () => {
    const params = { skip: 0, limit: 10, page: 1, filters: {}, userId: USER_ID };

    it("should pass the filters through unchanged for admin", async () => {
      vi.mocked(bookingRepository.findAllBookings).mockResolvedValue({ data: [], total: 0 });

      await bookingService.getAllBookings({
        ...params,
        role: "admin",
        filters: { status: "pending" },
      });

      expect(bookingRepository.findAllBookings).toHaveBeenCalledWith({
        skip: 0,
        limit: 10,
        filters: { status: "pending" },
      });
    });

    it("should pass the filters through unchanged for owner", async () => {
      vi.mocked(bookingRepository.findAllBookings).mockResolvedValue({ data: [], total: 0 });

      await bookingService.getAllBookings({ ...params, role: "owner", filters: { cabinId: 3 } });

      expect(bookingRepository.findAllBookings).toHaveBeenCalledWith(
        expect.objectContaining({ filters: { cabinId: 3 } }),
      );
    });

    it("should force guestUserId=userId for a guest", async () => {
      vi.mocked(bookingRepository.findAllBookings).mockResolvedValue({ data: [], total: 0 });

      await bookingService.getAllBookings({ ...params, role: "guest", filters: {} });

      expect(bookingRepository.findAllBookings).toHaveBeenCalledWith(
        expect.objectContaining({ filters: { guestUserId: USER_ID } }),
      );
    });

    it("should let the guest filter override an injected guestUserId", async () => {
      vi.mocked(bookingRepository.findAllBookings).mockResolvedValue({ data: [], total: 0 });

      await bookingService.getAllBookings({
        ...params,
        role: "guest",
        filters: { guestUserId: 999, status: "confirmed" },
      });

      expect(bookingRepository.findAllBookings).toHaveBeenCalledWith(
        expect.objectContaining({ filters: { guestUserId: USER_ID, status: "confirmed" } }),
      );
    });

    it("should build the pagination meta from total/page/limit", async () => {
      vi.mocked(bookingRepository.findAllBookings).mockResolvedValue({ data: [], total: 25 });

      const result = await bookingService.getAllBookings({
        ...params,
        role: "admin",
        page: 2,
        limit: 10,
      });

      expect(result.meta).toMatchObject({
        totalItems: 25,
        totalPages: 3,
        currentPage: 2,
        limit: 10,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });
  });

  // ------------------------------------------------------------------
  // getBookingById
  // ------------------------------------------------------------------
  describe("getBookingById", () => {
    it("should throw 404 when the booking does not exist", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(null);

      await expect(bookingService.getBookingById(1, USER_ID, "guest")).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_FOUND,
        code: ErrorCode.BOOKING_NOT_FOUND,
      });
    });

    it("should let the owner read their booking", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        id: 1,
        guest: { userId: USER_ID },
      } as never);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({ id: 1 } as never);

      await expect(bookingService.getBookingById(1, USER_ID, "guest")).resolves.toEqual({ id: 1 });
    });

    it("should reject a guest reading someone else's booking with 403", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        id: 1,
        guest: { userId: 999 },
      } as never);

      await expect(bookingService.getBookingById(1, USER_ID, "guest")).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });

    it("should let admin read any booking", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        id: 1,
        guest: { userId: 999 },
      } as never);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        guest: { id: 2 },
      } as never);

      await expect(bookingService.getBookingById(1, USER_ID, "admin")).resolves.toEqual({
        id: 1,
        guest: { id: 2 },
      });
    });

    it("should return the response shape (no guest.userId) via findBookingById", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        id: 1,
        guest: { userId: USER_ID },
      } as never);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        guest: { id: 5, fullName: "Test" },
      } as never);

      const result = await bookingService.getBookingById(1, USER_ID, "guest");

      expect(result).not.toHaveProperty("guest.userId");
      expect(bookingRepository.findBookingById).toHaveBeenCalledWith(1);
    });
  });

  // ------------------------------------------------------------------
  // payBooking
  // ------------------------------------------------------------------
  describe("payBooking", () => {
    const future = new Date(NOW.getTime() + 10 * 60_000);
    const owner = { id: 1, status: "pending", paymentDeadline: future, guest: { userId: USER_ID } };

    it("should confirm a pending booking with paidAt = now", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(owner as never);
      vi.mocked(bookingRepository.confirmPendingBooking).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "confirmed",
      } as never);

      const result = await bookingService.payBooking(1, USER_ID);

      expect(result.status).toBe("confirmed");
      expect(bookingRepository.confirmPendingBooking).toHaveBeenCalledWith(1, {
        paidAt: NOW,
        paymentReference: expect.any(String),
      });
    });

    it("should throw 404 when the booking does not exist", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(null);

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_NOT_FOUND,
      });
    });

    it("should reject a non-owner with 403", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...owner,
        guest: { userId: 999 },
      } as never);

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });

    it("should reject a non-pending booking with 409", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...owner,
        status: "confirmed",
      } as never);

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_ALREADY_PROCESSED,
      });
    });

    it("should reject when the payment deadline has passed", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...owner,
        paymentDeadline: new Date(NOW.getTime() - 1),
      } as never);

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_EXPIRED,
      });
    });

    it("should treat paymentDeadline === now as expired (exclusive boundary)", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...owner,
        paymentDeadline: new Date(NOW.getTime()),
      } as never);

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_EXPIRED,
      });
    });

    it("should reject when the atomic confirm returns false", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(owner as never);
      vi.mocked(bookingRepository.confirmPendingBooking).mockResolvedValue(false);

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_ALREADY_PROCESSED,
      });
    });

    it("should return the response shape without guest.userId", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(owner as never);
      vi.mocked(bookingRepository.confirmPendingBooking).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "confirmed",
        guest: { id: 5, fullName: "Test" },
      } as never);

      const result = await bookingService.payBooking(1, USER_ID);

      expect(result).not.toHaveProperty("guest.userId");
    });
  });

  // ------------------------------------------------------------------
  // cancelBooking
  // ------------------------------------------------------------------
  describe("cancelBooking", () => {
    const owner = { id: 1, status: "pending", guest: { userId: USER_ID } };

    it("should cancel a pending booking with userCancelled = now", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(owner as never);
      vi.mocked(bookingRepository.cancelPendingBooking).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "cancelled",
      } as never);

      const result = await bookingService.cancelBooking(1, USER_ID);

      expect(result.status).toBe("cancelled");
      expect(bookingRepository.cancelPendingBooking).toHaveBeenCalledWith(1, NOW, "userCancelled");
    });

    it("should reject a non-owner with 403", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...owner,
        guest: { userId: 999 },
      } as never);

      await expect(bookingService.cancelBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });

    it("should reject a non-pending booking", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...owner,
        status: "confirmed",
      } as never);

      await expect(bookingService.cancelBooking(1, USER_ID)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_CANNOT_CANCEL,
      });
    });

    it("should reject when the atomic cancel returns false", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(owner as never);
      vi.mocked(bookingRepository.cancelPendingBooking).mockResolvedValue(false);

      await expect(bookingService.cancelBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_CANNOT_CANCEL,
      });
    });
  });

  // ------------------------------------------------------------------
  // updateBookingStatus
  // ------------------------------------------------------------------
  describe("updateBookingStatus", () => {
    const base = {
      id: 1,
      status: "confirmed",
      startDate: utcDate("2026-06-10"),
      guest: { userId: USER_ID },
    };

    it("should allow confirmed → checkedIn when today >= startDate", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(base as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "checkedIn",
      } as never);

      const result = await bookingService.updateBookingStatus(1, { status: "checkedIn" });

      expect(result.status).toBe("checkedIn");
      expect(bookingRepository.transitionBookingStatus).toHaveBeenCalledWith(1, "confirmed", {
        status: "checkedIn",
      });
    });

    it("should allow checkedIn → checkedOut", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...base,
        status: "checkedIn",
      } as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "checkedOut",
      } as never);

      const result = await bookingService.updateBookingStatus(1, { status: "checkedOut" });

      expect(result.status).toBe("checkedOut");
    });

    it("should reject an invalid transition with 400", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...base,
        status: "pending",
      } as never);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
      });
    });

    it("should record cancelledAt and adminCancelled when cancelling", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(base as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "cancelled",
      } as never);

      await bookingService.updateBookingStatus(1, { status: "cancelled" });

      expect(bookingRepository.transitionBookingStatus).toHaveBeenCalledWith(1, "confirmed", {
        status: "cancelled",
        cancelledAt: NOW,
        cancellationReason: "adminCancelled",
      });
    });

    it("should reject check-in before the booking start date", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...base,
        startDate: addDaysUtc(TODAY, 5),
      } as never);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
      });
      expect(bookingRepository.transitionBookingStatus).not.toHaveBeenCalled();
    });

    it("should allow check-in on the exact start date", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...base,
        startDate: TODAY,
      } as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "checkedIn",
      } as never);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).resolves.toBeDefined();
    });

    it("should NOT apply the time check when checking out", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue({
        ...base,
        status: "checkedIn",
        startDate: addDaysUtc(TODAY, 5),
      } as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "checkedOut",
      } as never);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedOut" }),
      ).resolves.toBeDefined();
    });

    it("should reject with 409 when the atomic update returns false", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(base as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(false);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.CONFLICT,
        code: ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
      });
    });

    it("should throw 404 when the booking does not exist", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(null);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).rejects.toMatchObject({ code: ErrorCode.BOOKING_NOT_FOUND });
    });

    it("should return the response shape without guest.userId", async () => {
      vi.mocked(bookingRepository.findBookingWithOwnerById).mockResolvedValue(base as never);
      vi.mocked(bookingRepository.transitionBookingStatus).mockResolvedValue(true);
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "checkedIn",
        guest: { id: 5 },
      } as never);

      const result = await bookingService.updateBookingStatus(1, { status: "checkedIn" });

      expect(result).not.toHaveProperty("guest.userId");
    });
  });

  // ------------------------------------------------------------------
  // expirePendingBookings
  // ------------------------------------------------------------------
  describe("expirePendingBookings", () => {
    it("should pass a single now to the repository", async () => {
      vi.mocked(bookingRepository.expirePendingBookings).mockResolvedValue(2);

      const result = await bookingService.expirePendingBookings();

      expect(result).toBe(2);
      expect(bookingRepository.expirePendingBookings).toHaveBeenCalledWith(NOW);
    });
  });

  // ------------------------------------------------------------------
  // getBookedDates
  // ------------------------------------------------------------------
  describe("getBookedDates", () => {
    beforeEach(() => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue({ id: 1 } as never);
      vi.mocked(bookingRepository.findBookedDateRanges).mockResolvedValue([]);
    });

    it("should default `from` to today in the cabin timezone and `to` to from + max range", async () => {
      await bookingService.getBookedDates(1, {});

      const [, range, now] = vi.mocked(bookingRepository.findBookedDateRanges).mock.calls[0];
      expect(range.from.getTime()).toBe(TODAY.getTime());
      expect(range.to.getTime()).toBe(
        addDaysUtc(TODAY, DEFAULT_SETTINGS.maxAdvanceBookingDays + 1).getTime(),
      );
      expect(now.getTime()).toBe(NOW.getTime());
    });

    it("should default `to` from an explicit `from`", async () => {
      const from = utcDate("2027-01-01");
      await bookingService.getBookedDates(1, { from });

      const [, range] = vi.mocked(bookingRepository.findBookedDateRanges).mock.calls[0];
      expect(range.from.getTime()).toBe(from.getTime());
      expect(range.to.getTime()).toBe(
        addDaysUtc(from, DEFAULT_SETTINGS.maxAdvanceBookingDays + 1).getTime(),
      );
    });

    it("should pass explicit from/to through to the repository", async () => {
      const from = utcDate("2030-01-01");
      const to = utcDate("2030-01-10");
      await bookingService.getBookedDates(1, { from, to });

      const [, range] = vi.mocked(bookingRepository.findBookedDateRanges).mock.calls[0];
      expect(range.from.getTime()).toBe(from.getTime());
      expect(range.to.getTime()).toBe(to.getTime());
    });

    it("should reject a range longer than the maximum", async () => {
      const from = utcDate("2030-01-01");
      const to = addDaysUtc(from, DEFAULT_SETTINGS.maxAdvanceBookingDays + 1 + 1);

      await expect(bookingService.getBookedDates(1, { from, to })).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
      expect(bookingRepository.findBookedDateRanges).not.toHaveBeenCalled();
    });

    it("should accept a range exactly at the maximum", async () => {
      const from = utcDate("2030-01-01");
      const to = addDaysUtc(from, DEFAULT_SETTINGS.maxAdvanceBookingDays + 1);

      await expect(bookingService.getBookedDates(1, { from, to })).resolves.toEqual([]);
    });

    it("should throw 404 for an unknown cabin", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(null);

      await expect(bookingService.getBookedDates(999, {})).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it("should map the returned ranges", async () => {
      const ranges = [{ startDate: utcDate("2030-01-02"), endDate: utcDate("2030-01-04") }];
      vi.mocked(bookingRepository.findBookedDateRanges).mockResolvedValue(ranges);

      const result = await bookingService.getBookedDates(1, {});

      expect(result).toEqual(ranges);
    });
  });
});

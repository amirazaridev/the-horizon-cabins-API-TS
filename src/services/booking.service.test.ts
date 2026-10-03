import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addMinutes, subMinutes } from "date-fns";
import * as bookingService from "./booking.service.js";
import * as bookingRepository from "../repositories/booking.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
import { isValidStatusTransition } from "../utils/booking.util.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";

vi.mock("../repositories/booking.repository");
vi.mock("../repositories/cabin.repository");
vi.mock("../repositories/guest.repository");
vi.mock("../config/database", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

const USER_ID = 1;

describe("booking.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    vi.clearAllMocks();
    vi.mocked(bookingRepository.findOverlappingBooking).mockResolvedValue(null);
    vi.mocked(bookingRepository.countPendingBookingsForGuest).mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("isValidStatusTransition", () => {
    it("should allow confirmed → checkedIn", () => {
      expect(isValidStatusTransition("confirmed", "checkedIn")).toBe(true);
    });

    it("should allow checkedIn → checkedOut", () => {
      expect(isValidStatusTransition("checkedIn", "checkedOut")).toBe(true);
    });

    it("should reject pending → checkedIn", () => {
      expect(isValidStatusTransition("pending", "checkedIn")).toBe(false);
    });

    it("should reject checkedOut → confirmed", () => {
      expect(isValidStatusTransition("checkedOut", "confirmed")).toBe(false);
    });

    it("should reject cancelled → anything", () => {
      expect(isValidStatusTransition("cancelled", "confirmed")).toBe(false);
      expect(isValidStatusTransition("cancelled", "checkedIn")).toBe(false);
    });
  });

  describe("createBooking", () => {
    const mockCabin = {
      id: 1,
      name: "Test Cabin",
      maxCapacity: 4,
      regularPrice: 100000,
      discount: 10,
    };
    const mockGuest = { id: 1, userId: USER_ID, fullName: "Test Guest" };

    const validInput = {
      cabinId: 1,
      startDate: new Date("2025-06-20"),
      endDate: new Date("2025-06-22"),
      numGuests: 2,
    };

    function mockTransaction() {
      return {
        booking: {
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 1, status: "pending" }),
        },
      };
    }

    async function stubTransaction(mockTx: unknown) {
      const { prisma } = await import("../config/database.js");
      const transaction = prisma.$transaction as unknown as {
        mockImplementation: (fn: (callback: (tx: unknown) => unknown) => unknown) => void;
      };
      transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(mockTx));
    }

    it("should create a booking successfully", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as never);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as never);
      vi.mocked(bookingRepository.createBooking).mockResolvedValue({
        id: 1,
        status: "pending",
      } as never);

      const mockTx = mockTransaction();
      await stubTransaction(mockTx);

      const result = await bookingService.createBooking(validInput, USER_ID);

      expect(result).toEqual({ id: 1, status: "pending" });
      expect(bookingRepository.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          numNights: 2,
          cabinPrice: 90000,
          totalPrice: BigInt(180000),
          status: "pending",
        }),
        mockTx,
      );
    });

    it("should reject when startDate is in the past", async () => {
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: new Date("2025-06-10"), endDate: new Date("2025-06-12") },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
        statusCode: HTTP_STATUS.BAD_REQUEST,
      });
    });

    it("should reject when endDate is not after startDate", async () => {
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: new Date("2025-06-20"), endDate: new Date("2025-06-20") },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should reject when numNights exceeds maximum", async () => {
      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: new Date("2025-06-20"), endDate: new Date("2025-07-25") },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should reject when numGuests exceeds cabin capacity", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as never);

      await expect(
        bookingService.createBooking({ ...validInput, numGuests: 10 }, USER_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_GUEST_CAPACITY_EXCEEDED,
      });
    });

    it("should reject when dates overlap with existing booking", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as never);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as never);
      vi.mocked(bookingRepository.findOverlappingBooking).mockResolvedValue({
        id: 99,
        status: "confirmed",
      } as never);

      const mockTx = mockTransaction();
      await stubTransaction(mockTx);

      await expect(
        bookingService.createBooking(
          { ...validInput, startDate: new Date("2025-06-21"), endDate: new Date("2025-06-23") },
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_DATE_OVERLAP,
        statusCode: HTTP_STATUS.CONFLICT,
      });
    });

    it("should reject when guest has too many pending bookings", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as never);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as never);
      vi.mocked(bookingRepository.countPendingBookingsForGuest).mockResolvedValue(3);

      const mockTx = mockTransaction();
      await stubTransaction(mockTx);

      await expect(bookingService.createBooking(validInput, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_PENDING_LIMIT_EXCEEDED,
      });
    });
  });

  describe("payBooking", () => {
    const mockBooking = (overrides: Record<string, unknown>) => ({
      id: 1,
      status: "pending",
      guestId: 1,
      guest: { userId: USER_ID },
      ...overrides,
    });

    it("should pay a pending booking successfully", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(
        mockBooking({ paymentDeadline: addMinutes(new Date(), 10) }) as never,
      );
      vi.mocked(bookingRepository.updateBooking).mockResolvedValue({
        status: "confirmed",
        paymentReference: "ref-123",
      } as never);

      const result = await bookingService.payBooking(1, USER_ID);

      expect(result.status).toBe("confirmed");
      expect(bookingRepository.updateBooking).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: "confirmed" }),
      );
    });

    it("should reject payment on already-confirmed booking", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(
        mockBooking({ status: "confirmed" }) as never,
      );

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_PROCESSED,
      });
    });

    it("should reject payment on expired booking", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(
        mockBooking({ paymentDeadline: subMinutes(new Date(), 5) }) as never,
      );

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_EXPIRED,
      });
    });

    it("should reject payment by non-owner", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(
        mockBooking({ guest: { userId: 999 } }) as never,
      );

      await expect(bookingService.payBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });
  });

  describe("cancelBooking", () => {
    const mockBooking = (overrides: Record<string, unknown>) => ({
      id: 1,
      status: "pending",
      guestId: 1,
      guest: { userId: USER_ID },
      ...overrides,
    });

    it("should cancel a pending booking successfully", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking({}) as never);
      vi.mocked(bookingRepository.updateBooking).mockResolvedValue({
        status: "cancelled",
        cancellationReason: "userCancelled",
      } as never);

      const result = await bookingService.cancelBooking(1, USER_ID);

      expect(result.status).toBe("cancelled");
      expect(result.cancellationReason).toBe("userCancelled");
    });

    it("should reject cancellation by non-owner", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(
        mockBooking({ guest: { userId: 999 } }) as never,
      );

      await expect(bookingService.cancelBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });

    it("should reject cancellation of confirmed booking", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(
        mockBooking({ status: "confirmed" }) as never,
      );

      await expect(bookingService.cancelBooking(1, USER_ID)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_CANNOT_CANCEL,
      });
    });
  });

  describe("updateBookingStatus", () => {
    it("should allow confirmed → checkedIn", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "confirmed",
      } as never);
      vi.mocked(bookingRepository.updateBooking).mockResolvedValue({
        status: "checkedIn",
      } as never);

      const result = await bookingService.updateBookingStatus(1, { status: "checkedIn" });

      expect(result.status).toBe("checkedIn");
    });

    it("should reject invalid transition", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        status: "pending",
      } as never);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
      });
    });
  });

  describe("getBookingById", () => {
    it("should reject when booking does not belong to the guest", async () => {
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue({
        id: 1,
        guest: { userId: 999 },
      } as never);

      await expect(bookingService.getBookingById(1, USER_ID, "guest")).rejects.toMatchObject({
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });

    it("should allow admin to view any booking", async () => {
      const booking = { id: 1, guest: { userId: 999 } };
      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(booking as never);

      await expect(bookingService.getBookingById(1, USER_ID, "admin")).resolves.toEqual(booking);
    });
  });

  describe("getBookedDates", () => {
    it("should return the booked ranges for a cabin", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue({ id: 1 } as never);
      vi.mocked(bookingRepository.findBookedDateRanges).mockResolvedValue([
        { startDate: new Date("2025-06-20"), endDate: new Date("2025-06-22") },
      ]);

      const result = await bookingService.getBookedDates(1, {});

      expect(result).toHaveLength(1);
      expect(result[0].startDate).toEqual(new Date("2025-06-20"));
    });

    it("should reject for an unknown cabin", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(null);

      await expect(bookingService.getBookedDates(999, {})).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe("expirePendingBookings", () => {
    it("should expire pending bookings", async () => {
      vi.mocked(bookingRepository.expirePendingBookings).mockResolvedValue(3);

      const result = await bookingService.expirePendingBookings();

      expect(result).toBe(3);
      expect(bookingRepository.expirePendingBookings).toHaveBeenCalledWith(expect.any(Date));
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addMinutes, subMinutes } from "date-fns";
import * as bookingService from "./booking.service.js";
import * as bookingRepository from "../repositories/booking.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
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

describe("booking.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("isValidStatusTransition", () => {
    it("should allow confirmed → checkedIn", () => {
      expect(bookingService.isValidStatusTransition("confirmed", "checkedIn")).toBe(true);
    });

    it("should allow checkedIn → checkedOut", () => {
      expect(bookingService.isValidStatusTransition("checkedIn", "checkedOut")).toBe(true);
    });

    it("should reject pending → checkedIn", () => {
      expect(bookingService.isValidStatusTransition("pending", "checkedIn")).toBe(false);
    });

    it("should reject checkedOut → confirmed", () => {
      expect(bookingService.isValidStatusTransition("checkedOut", "confirmed")).toBe(false);
    });

    it("should reject cancelled → anything", () => {
      expect(bookingService.isValidStatusTransition("cancelled", "confirmed")).toBe(false);
      expect(bookingService.isValidStatusTransition("cancelled", "checkedIn")).toBe(false);
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
    const mockGuest = { id: 1, userId: 1, fullName: "Test Guest" };

    it("should create a booking successfully", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);

      const mockTx = {
        booking: {
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 1, status: "pending" }),
        },
      };

      const { prisma } = await import("../config/database.js");
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));

      const result = await bookingService.createBooking(
        {
          cabinId: 1,
          startDate: new Date("2025-06-20"),
          endDate: new Date("2025-06-22"),
          numGuests: 2,
        },
        1,
      );

      expect(result).toEqual({ id: 1, status: "pending" });
      expect(mockTx.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            numNights: 2,
            cabinPrice: 90000,
            totalPrice: BigInt(180000),
            status: "pending",
          }),
        }),
      );
    });

    it("should reject when startDate is in the past", async () => {
      await expect(
        bookingService.createBooking(
          {
            cabinId: 1,
            startDate: new Date("2025-06-10"),
            endDate: new Date("2025-06-12"),
            numGuests: 2,
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
        statusCode: HTTP_STATUS.BAD_REQUEST,
      });
    });

    it("should reject when endDate is not after startDate", async () => {
      await expect(
        bookingService.createBooking(
          {
            cabinId: 1,
            startDate: new Date("2025-06-20"),
            endDate: new Date("2025-06-20"),
            numGuests: 2,
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should reject when numNights exceeds maximum", async () => {
      await expect(
        bookingService.createBooking(
          {
            cabinId: 1,
            startDate: new Date("2025-06-20"),
            endDate: new Date("2025-07-25"),
            numGuests: 2,
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_DATE_RANGE,
      });
    });

    it("should reject when numGuests exceeds cabin capacity", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as any);

      await expect(
        bookingService.createBooking(
          {
            cabinId: 1,
            startDate: new Date("2025-06-20"),
            endDate: new Date("2025-06-22"),
            numGuests: 10,
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_GUEST_CAPACITY_EXCEEDED,
      });
    });

    it("should reject when dates overlap with existing booking", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as any);

      const mockTx = {
        booking: {
          findFirst: vi.fn().mockResolvedValue({ id: 99, status: "confirmed" }),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
        },
      };

      const { prisma } = await import("../config/database.js");
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));

      await expect(
        bookingService.createBooking(
          {
            cabinId: 1,
            startDate: new Date("2025-06-21"),
            endDate: new Date("2025-06-23"),
            numGuests: 2,
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_DATE_OVERLAP,
        statusCode: HTTP_STATUS.CONFLICT,
      });
    });

    it("should reject when guest has too many pending bookings", async () => {
      vi.mocked(cabinRepository.findCabinById).mockResolvedValue(mockCabin as any);

      const mockTx = {
        booking: {
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(3),
          create: vi.fn(),
        },
      };

      const { prisma } = await import("../config/database.js");
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));

      await expect(
        bookingService.createBooking(
          {
            cabinId: 1,
            startDate: new Date("2025-06-20"),
            endDate: new Date("2025-06-22"),
            numGuests: 2,
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_PENDING_LIMIT_EXCEEDED,
      });
    });
  });

  describe("payBooking", () => {
    it("should pay a pending booking successfully", async () => {
      const mockBooking = {
        id: 1,
        status: "pending",
        guestId: 1,
        paymentDeadline: addMinutes(new Date(), 10),
      };
      const mockGuest = { id: 1, userId: 1 };
      const mockUpdated = {
        ...mockBooking,
        status: "confirmed",
        paidAt: new Date(),
        paymentReference: "ref-123",
      };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);
      vi.mocked(bookingRepository.updateBooking).mockResolvedValue(mockUpdated as any);

      const result = await bookingService.payBooking(1, 1);

      expect(result.status).toBe("confirmed");
      expect(result.paymentReference).toBeDefined();
    });

    it("should reject payment on already-confirmed booking", async () => {
      const mockBooking = {
        id: 1,
        status: "confirmed",
        guestId: 1,
        paymentDeadline: addMinutes(new Date(), 10),
      };
      const mockGuest = { id: 1, userId: 1 };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);

      await expect(bookingService.payBooking(1, 1)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_ALREADY_PROCESSED,
      });
    });

    it("should reject payment on expired booking", async () => {
      const mockBooking = {
        id: 1,
        status: "pending",
        guestId: 1,
        paymentDeadline: subMinutes(new Date(), 5),
      };
      const mockGuest = { id: 1, userId: 1 };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);

      await expect(bookingService.payBooking(1, 1)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_EXPIRED,
      });
    });

    it("should reject payment by non-owner", async () => {
      const mockBooking = {
        id: 1,
        status: "pending",
        guestId: 2,
        paymentDeadline: addMinutes(new Date(), 10),
      };
      const mockGuest = { id: 1, userId: 1 };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);

      await expect(bookingService.payBooking(1, 1)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });
  });

  describe("cancelBooking", () => {
    it("should cancel a pending booking successfully", async () => {
      const mockBooking = { id: 1, status: "pending", guestId: 1 };
      const mockGuest = { id: 1, userId: 1 };
      const mockUpdated = {
        ...mockBooking,
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: "userCancelled",
      };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);
      vi.mocked(bookingRepository.updateBooking).mockResolvedValue(mockUpdated as any);

      const result = await bookingService.cancelBooking(1, 1);

      expect(result.status).toBe("cancelled");
      expect(result.cancellationReason).toBe("userCancelled");
    });

    it("should reject cancellation by non-owner", async () => {
      const mockBooking = { id: 1, status: "pending", guestId: 2 };
      const mockGuest = { id: 1, userId: 1 };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);

      await expect(bookingService.cancelBooking(1, 1)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_FORBIDDEN,
      });
    });

    it("should reject cancellation of confirmed booking", async () => {
      const mockBooking = { id: 1, status: "confirmed", guestId: 1 };
      const mockGuest = { id: 1, userId: 1 };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(mockGuest as any);

      await expect(bookingService.cancelBooking(1, 1)).rejects.toMatchObject({
        code: ErrorCode.BOOKING_CANNOT_CANCEL,
      });
    });
  });

  describe("updateBookingStatus", () => {
    it("should allow confirmed → checkedIn", async () => {
      const mockBooking = { id: 1, status: "confirmed" };
      const mockUpdated = { ...mockBooking, status: "checkedIn" };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);
      vi.mocked(bookingRepository.updateBooking).mockResolvedValue(mockUpdated as any);

      const result = await bookingService.updateBookingStatus(1, { status: "checkedIn" });

      expect(result.status).toBe("checkedIn");
    });

    it("should reject invalid transition", async () => {
      const mockBooking = { id: 1, status: "pending" };

      vi.mocked(bookingRepository.findBookingById).mockResolvedValue(mockBooking as any);

      await expect(
        bookingService.updateBookingStatus(1, { status: "checkedIn" }),
      ).rejects.toMatchObject({
        code: ErrorCode.BOOKING_INVALID_STATUS_TRANSITION,
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

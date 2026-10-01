import type { Request, Response } from "express";
import * as bookingService from "../services/booking.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import type { BookedDatesQuery, BookingFilters } from "../types/booking.types.js";

export async function create(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.createBooking(req.body, req.user!.id);
  sendSuccess(res, { statusCode: 201, data: { booking } });
}

export async function getAll(req: Request, res: Response): Promise<void> {
  const { skip, limit, page } = req.pagination!;
  const query = req.parseQuery as BookingFilters;

  const filters: BookingFilters = {
    status: query.status,
    cabinId: query.cabinId,
    guestId: query.guestId,
    startDateFrom: query.startDateFrom,
    startDateTo: query.startDateTo,
  };

  const { data: bookings, meta } = await bookingService.getAllBookings({
    skip,
    limit,
    page,
    filters,
    role: req.user!.role,
    userId: req.user!.id,
  });

  sendSuccess(res, { data: { bookings, meta } });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.getBookingById(
    Number(req.params.id),
    req.user!.id,
    req.user!.role,
  );
  sendSuccess(res, { data: { booking } });
}

export async function pay(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.payBooking(Number(req.params.id), req.user!.id);
  sendSuccess(res, { data: { booking } });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.cancelBooking(Number(req.params.id), req.user!.id);
  sendSuccess(res, { data: { booking } });
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const booking = await bookingService.updateBookingStatus(id, req.body);
  sendSuccess(res, { data: { booking } });
}

export async function getBookedDates(req: Request, res: Response): Promise<void> {
  const cabinId = Number(req.params.cabinId);
  const { from, to } = req.parseQuery as BookedDatesQuery;

  const bookedDates = await bookingService.getBookedDates(cabinId, { from, to });
  sendSuccess(res, { data: { bookedDates } });
}

import type { Request, Response } from "express";
import * as bookingService from "../services/booking.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getIntParam, getQuery } from "../utils/request.util.js";
import type { BookedDatesQuery, BookingFilters } from "../types/booking.types.js";

export async function create(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.createBooking(req.body, req.user!.id);
  sendSuccess(res, { statusCode: 201, data: { booking } });
}

export async function getAll(req: Request, res: Response): Promise<void> {
  const { skip, limit, page } = req.pagination!;
  const query = getQuery<BookingFilters>(req);

  const filters: BookingFilters = {
    status: query.status,
    statuses: query.statuses,
    cabinId: query.cabinId,
    cityId: query.cityId,
    guestId: query.guestId,
    guestQuery: query.guestQuery,
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
    getIntParam(req, "id"),
    req.user!.id,
    req.user!.role,
  );
  sendSuccess(res, { data: { booking } });
}

export async function pay(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.payBooking(getIntParam(req, "id"), req.user!.id);
  sendSuccess(res, { data: { booking } });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.cancelBooking(getIntParam(req, "id"), req.user!.id);
  sendSuccess(res, { data: { booking } });
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const id = getIntParam(req, "id");
  const booking = await bookingService.updateBookingStatus(id, req.body);
  sendSuccess(res, { data: { booking } });
}

export async function getBookedDates(req: Request, res: Response): Promise<void> {
  const cabinId = getIntParam(req, "cabinId");
  const { from, to } = getQuery<BookedDatesQuery>(req);

  const bookedDates = await bookingService.getBookedDates(cabinId, { from, to });
  sendSuccess(res, { data: { bookedDates } });
}

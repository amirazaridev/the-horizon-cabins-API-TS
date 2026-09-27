import type { Request, Response } from "express";
import * as bookingService from "../services/booking.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { BookingFilters } from "../types/booking.types.js";

export async function create(req: Request, res: Response): Promise<void> {
  const booking = await bookingService.createBooking(req.body, req.user!.id);
  res.status(201).json({ status: "success", data: { booking } });
}

export async function getAll(req: Request, res: Response): Promise<void> {
  const { skip, limit, page } = req.pagination!;
  const { parseQuery } = req;
  const query = parseQuery as Record<string, unknown>;

  const filters: BookingFilters = {};
  if (query.status) filters.status = query.status as BookingFilters["status"];
  if (query.cabinId) filters.cabinId = query.cabinId as number;
  if (query.guestId) filters.guestId = query.guestId as number;
  if (query.startDateFrom) filters.startDateFrom = query.startDateFrom as Date;
  if (query.startDateTo) filters.startDateTo = query.startDateTo as Date;

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
  const booking = await bookingService.getBookingById(Number(req.params.id), req.user!.id, req.user!.role);
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

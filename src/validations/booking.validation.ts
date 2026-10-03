import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import { paginationQueryValidation } from "./pagination.validation.js";

const idParamsSchema = z.object({
  cabinId: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

const createBookingBodySchema = z.object({
  cabinId: z.preprocess(safeNumber, z.number().int().positive()),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  numGuests: z.preprocess(safeNumber, z.number().int().min(1)),
  observations: z.string().trim().max(2000).optional(),
});

const listBookingsQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "checkedIn", "checkedOut"]).optional(),
  cabinId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  guestId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  startDateFrom: z.coerce.date().optional(),
  startDateTo: z.coerce.date().optional(),
});
const listBookingWithPagQuerySchema = z.object({
  ...paginationQueryValidation.query.shape,
  ...listBookingsQuerySchema.shape,
});

const updateStatusBodySchema = z.object({
  status: z.enum(["checkedIn", "checkedOut", "cancelled"]),
});

const bookedDatesQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export const createBookingSchema = { body: createBookingBodySchema };
export const listBookingsQueryValidation = { query: listBookingWithPagQuerySchema };
export const getBookingSchema = { params: idParamsSchema };
export const payBookingSchema = { params: idParamsSchema };
export const cancelBookingSchema = { params: idParamsSchema };
export const updateBookingStatusSchema = { params: idParamsSchema, body: updateStatusBodySchema };
export const bookedDatesSchema = { params: idParamsSchema, query: bookedDatesQuerySchema };

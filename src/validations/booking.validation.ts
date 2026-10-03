import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import { paginationQueryValidation } from "./pagination.validation.js";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

const cabinIdParamsSchema = z.object({
  cabinId: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

const createBookingBodySchema = z.object({
  cabinId: z.preprocess(safeNumber, z.number().int().positive()),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  numGuests: z.preprocess(safeNumber, z.number().int().min(1)),
  observations: z.string().trim().max(2000).optional(),
});

const listBookingsQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "checkedIn", "checkedOut"]).optional(),
  cabinId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  guestId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  startDateFrom: dateOnlySchema.optional(),
  startDateTo: dateOnlySchema.optional(),
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
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
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
export const bookedDatesSchema = { params: cabinIdParamsSchema, query: bookedDatesQuerySchema };

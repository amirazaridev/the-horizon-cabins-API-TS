import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import { paginationQueryValidation } from "./pagination.validation.js";
import { BookingStatus } from "../generated/prisma/enums.js";
import { BOOKING_CONSTANTS } from "../constants/booking.constants.js";

const DAY_MS = 86_400_000;

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
  status: z.enum(BookingStatus).optional(),
  cabinId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  guestId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  startDateFrom: dateOnlySchema.optional(),
  startDateTo: dateOnlySchema.optional(),
});
const listBookingWithPagQuerySchema = z.object({
  ...paginationQueryValidation.query.shape,
  ...listBookingsQuerySchema.shape,
});

/** فقط وضعیت‌هایی که ادمین مجاز است روی آن‌ها ترنزیشن بزند. */
const updatableBookingStatusSchema = z
  .enum(BookingStatus)
  .extract(["checkedIn", "checkedOut", "cancelled"]);

const updateStatusBodySchema = z.object({
  status: updatableBookingStatusSchema,
});

const bookedDatesQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  })
  .refine(
    (range) =>
      !range.from ||
      !range.to ||
      (range.to.getTime() - range.from.getTime()) / DAY_MS <=
        BOOKING_CONSTANTS.BOOKED_DATES_MAX_RANGE_DAYS,
    {
      message: `Date range cannot exceed ${BOOKING_CONSTANTS.BOOKED_DATES_MAX_RANGE_DAYS} days`,
      path: ["to"],
    },
  );

export const createBookingSchema = { body: createBookingBodySchema };
export const listBookingsQueryValidation = { query: listBookingWithPagQuerySchema };
export const getBookingSchema = { params: idParamsSchema };
export const payBookingSchema = { params: idParamsSchema };
export const cancelBookingSchema = { params: idParamsSchema };
export const updateBookingStatusSchema = { params: idParamsSchema, body: updateStatusBodySchema };
export const bookedDatesSchema = { params: cabinIdParamsSchema, query: bookedDatesQuerySchema };

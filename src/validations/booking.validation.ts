import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import { paginationQueryValidation } from "./pagination.validation.js";
import { BookingStatus } from "../generated/prisma/enums.js";
import { cabinIdParamsSchema, csvToArray, dateOnlySchema, idParamsSchema } from "./shared.validation.js";
import type { AppSettings } from "../types/setting.types.js";

const DAY_MS = 86_400_000;

const createBookingBodySchema = z.object({
  cabinId: z.preprocess(safeNumber, z.number().int().positive()),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  numGuests: z.preprocess(safeNumber, z.number().int().min(1)),
  observations: z.string().trim().max(2000).optional(),
  //* اختیاری: اگر ارسال شود و با قیمت محاسبه‌شده‌ی سرور تفاوت داشته باشد → 409 PRICE_CHANGED.
  expectedTotalPrice: z.preprocess(safeNumber, z.number().int().nonnegative().optional()),
});

/** `GET /cabins/:cabinId/price-quote?startDate=&endDate=` */
const priceQuoteQuerySchema = z.object({
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
});

const listBookingsQuerySchema = z.object({
  status: z.enum(BookingStatus).optional(),
  /** فیلتر چندوضعیتی داشبورد — CSV (`?statuses=confirmed,checkedIn`). */
  statuses: z.preprocess(csvToArray, z.array(z.enum(BookingStatus)).optional()),
  cabinId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  /** فیلتر شهر — از طریق رابطه‌ی اقامتگاه. */
  cityId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  guestId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  /** جستجوی نام مهمان (حداقل ۲ کاراکتر). */
  guestQuery: z.string().trim().min(2).max(100).optional(),
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

/** حداکثر بازه‌ی تاریخ‌های رزروشده از تنظیمات مؤثر می‌آید → factory. */
function buildBookedDatesQuerySchema(settings: AppSettings) {
  return z
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
        (range.to.getTime() - range.from.getTime()) / DAY_MS <= settings.bookedDatesMaxRangeDays,
      {
        message: `Date range cannot exceed ${settings.bookedDatesMaxRangeDays} days`,
        path: ["to"],
      },
    );
}

export const createBookingSchema = { body: createBookingBodySchema };
export const priceQuoteSchema = { params: cabinIdParamsSchema, query: priceQuoteQuerySchema };
export const listBookingsQueryValidation = { query: listBookingWithPagQuerySchema };
export const getBookingSchema = { params: idParamsSchema };
export const payBookingSchema = { params: idParamsSchema };
export const cancelBookingSchema = { params: idParamsSchema };
export const updateBookingStatusSchema = { params: idParamsSchema, body: updateStatusBodySchema };
export const bookedDatesSchema = (settings: AppSettings) => ({
  params: cabinIdParamsSchema,
  query: buildBookedDatesQuerySchema(settings),
});

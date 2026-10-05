import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import { cabinIdParamsSchema, dateOnlySchema } from "./shared.validation.js";

/** `GET /cabins/:cabinId/price-calendar?from=&to=` */
export const priceCalendarQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((range) => !range.from || !range.to || range.from.getTime() <= range.to.getTime(), {
    message: "from must be before or equal to to",
    path: ["from"],
  });

export const cabinPriceCalendarSchema = {
  params: cabinIdParamsSchema,
  query: priceCalendarQuerySchema,
};

/** `POST /price-calendar/rebuild` — cabinId اختیاری (نبود = همه). */
export const rebuildCalendarBodySchema = z
  .object({
    cabinId: z.preprocess(safeNumber, z.number().int().positive().optional()),
  })
  .strict();

export const rebuildCalendarSchema = { body: rebuildCalendarBodySchema };

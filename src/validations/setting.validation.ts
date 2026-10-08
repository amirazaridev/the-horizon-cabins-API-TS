import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";

/**
 * اعتبارسنجی بدنه‌ی `PATCH /settings`.
 *
 * فقط **شکل** هر فیلد (عدد صحیح و کرانِ مطلق) اینجا بررسی می‌شود؛ سازگاری
 * بین‌فیلدی روی مقدار merge‌شده در سرویس انجام می‌گیرد (چون PATCH جزئی است و
 * مقدار فعلی ردیف هم در تصمیم دخیل است).
 */

/** عدد صحیح با کف (و سقف اختیاری)، با preprocess برای مقادیر رشته‌ای ورودی. */
function intSchema(min: number, message: string, max?: number) {
  let schema = z.number({ message }).int({ message }).min(min, { message });
  if (max !== undefined) schema = schema.max(max, { message });
  return z.preprocess(safeNumber, schema);
}

const updateSettingsBodySchema = z
  .object({
    // Booking
    minBookingLength: intSchema(1, "minBookingLength must be at least 1").optional(),
    maxBookingLength: intSchema(1, "maxBookingLength must be at least 1").optional(),
    maxGuests: intSchema(1, "maxGuests must be at least 1").optional(),
    maxAdvanceBookingDays: intSchema(1, "maxAdvanceBookingDays must be at least 1").optional(),
    maxPendingBookingsPerGuest: intSchema(
      0,
      "maxPendingBookingsPerGuest cannot be negative",
    ).optional(),
    paymentDeadlineMinutes: intSchema(1, "paymentDeadlineMinutes must be at least 1").optional(),

    // Pricing
    maxDiscountsPerNight: intSchema(0, "maxDiscountsPerNight cannot be negative").optional(),
    maxSurchargesPerNight: intSchema(0, "maxSurchargesPerNight cannot be negative").optional(),
    maxTotalDiscountPercent: intSchema(
      0,
      "maxTotalDiscountPercent must be between 0 and 100",
      100,
    ).optional(),
    maxTotalSurchargePercent: intSchema(
      0,
      "maxTotalSurchargePercent cannot be negative",
    ).optional(),
    maxNightlyPrice: intSchema(1, "maxNightlyPrice must be at least 1").optional(),
    minRegularPrice: intSchema(1, "minRegularPrice must be at least 1").optional(),
    maxRegularPrice: intSchema(1, "maxRegularPrice must be at least 1").optional(),
    startingPriceWindowDays: intSchema(1, "startingPriceWindowDays must be at least 1").optional(),
    priceRuleMaxFutureDays: intSchema(1, "priceRuleMaxFutureDays must be at least 1").optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const updateSettingsSchema = {
  body: updateSettingsBodySchema,
};

import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { INT4_MAX } from "../constants/setting.constants.js";
import { deriveMaxRegularPrice } from "../utils/price-limits.util.js";
import type { SettingsColumns } from "../types/setting.types.js";

/**
 * اعتبارسنجی بدنه‌ی `PATCH /settings`.
 *
 * فقط **شکل** هر فیلد (عدد صحیح و کرانِ مطلق) اینجا بررسی می‌شود؛ سازگاری
 * بین‌فیلدی روی مقدار merge‌شده در سرویس انجام می‌گیرد (چون PATCH جزئی است و
 * مقدار فعلی ردیف هم در تصمیم دخیل است).
 *
 * سقف‌ها طوری انتخاب شده‌اند که هیچ مقداری ستون‌های int4 را سرریز نکند و
 * دامنه‌ی معنادار حفظ شود (مثلاً افق رزرو ≤ ۳۶۵ روز، مهلت پرداخت ≤ ۷ روز).
 */
const BOUNDS = {
  minBookingLength: { min: 1, max: 365 },
  maxBookingLength: { min: 1, max: 365 },
  maxGuests: { min: 1, max: 100 },
  maxAdvanceBookingDays: { min: 1, max: 365 },
  maxPendingBookingsPerGuest: { min: 0, max: 100 },
  paymentDeadlineMinutes: { min: 1, max: 10_080 },
  maxDiscountsPerNight: { min: 0, max: 10 },
  maxSurchargesPerNight: { min: 0, max: 10 },
  maxTotalDiscountPercent: { min: 0, max: 100 },
  maxTotalSurchargePercent: { min: 0, max: 1000 },
  maxNightlyPrice: { min: 1, max: INT4_MAX },
  minRegularPrice: { min: 1, max: INT4_MAX },
  maxRegularPrice: { min: 1, max: INT4_MAX },
  startingPriceWindowDays: { min: 1, max: 365 },
  priceRuleMaxFutureDays: { min: 1, max: 3650 },
} as const;

/** عدد صحیح در بازه‌ی مجاز؛ پیام خطا برای هر نوع نقض جداست. */
function intSchema(field: keyof typeof BOUNDS) {
  const { min, max } = BOUNDS[field];
  return z.preprocess(
    safeNumber,
    z
      .number({ message: `${field} must be a number` })
      .int({ message: `${field} must be an integer` })
      .min(min, { message: `${field} must be at least ${min}` })
      .max(max, { message: `${field} cannot exceed ${max}` }),
  );
}

export const updateSettingsFields = z
  .object({
    // Booking
    minBookingLength: intSchema("minBookingLength").optional(),
    maxBookingLength: intSchema("maxBookingLength").optional(),
    maxGuests: intSchema("maxGuests").optional(),
    maxAdvanceBookingDays: intSchema("maxAdvanceBookingDays").optional(),
    maxPendingBookingsPerGuest: intSchema("maxPendingBookingsPerGuest").optional(),
    paymentDeadlineMinutes: intSchema("paymentDeadlineMinutes").optional(),

    // Pricing
    maxDiscountsPerNight: intSchema("maxDiscountsPerNight").optional(),
    maxSurchargesPerNight: intSchema("maxSurchargesPerNight").optional(),
    maxTotalDiscountPercent: intSchema("maxTotalDiscountPercent").optional(),
    maxTotalSurchargePercent: intSchema("maxTotalSurchargePercent").optional(),
    maxNightlyPrice: intSchema("maxNightlyPrice").optional(),
    minRegularPrice: intSchema("minRegularPrice").optional(),
    maxRegularPrice: intSchema("maxRegularPrice").optional(),
    startingPriceWindowDays: intSchema("startingPriceWindowDays").optional(),
    priceRuleMaxFutureDays: intSchema("priceRuleMaxFutureDays").optional(),
  })
  .strict();

/** اسکیمای نهایی بدنه — علاوه بر فیلدها، خالی‌نبودن را هم الزام می‌کند. */
export const updateSettingsBodySchema = updateSettingsFields.refine(
  (body) => Object.keys(body).length > 0,
  { message: "At least one field must be provided" },
);

export const updateSettingsSchema = {
  body: updateSettingsBodySchema,
};

/** ورودی `PATCH /settings` — از روی اسکیمای Zod مشتق می‌شود (بدون نسخه‌ی دست‌نویس). */
export type UpdateSettingsInput = z.infer<typeof updateSettingsBodySchema>;

function invalid(message: string): AppError {
  return new AppError(message, HTTP_STATUS.BAD_REQUEST, ErrorCode.SETTINGS_INVALID);
}

/**
 * سازگاری بین‌فیلدی روی ردیفِ **merge‌شده** (نه فقط فیلدهای ارسالی)، چون PATCH
 * جزئی است و مقدار فعلی ردیف هم در تصمیم دخیل است.
 *
 * توابع pure و بدون I/O؛ در تست‌های unit مستقیم قابل فراخوانی است.
 */
export function assertConsistent(settings: SettingsColumns): void {
  if (settings.maxBookingLength < settings.minBookingLength) {
    throw invalid("maxBookingLength must be greater than or equal to minBookingLength");
  }

  if (settings.startingPriceWindowDays > settings.maxAdvanceBookingDays) {
    throw invalid("startingPriceWindowDays cannot exceed maxAdvanceBookingDays");
  }

  if (settings.maxRegularPrice < settings.minRegularPrice) {
    throw invalid("maxRegularPrice must be greater than or equal to minRegularPrice");
  }

  if (settings.maxNightlyPrice < settings.minRegularPrice) {
    throw invalid("maxNightlyPrice must be greater than or equal to minRegularPrice");
  }

  const derivedMaxRegularPrice = deriveMaxRegularPrice(
    settings.maxNightlyPrice,
    settings.maxTotalSurchargePercent,
  );
  if (settings.maxRegularPrice > derivedMaxRegularPrice) {
    throw invalid(
      `maxRegularPrice (${settings.maxRegularPrice}) exceeds the allowed maximum ` +
        `${derivedMaxRegularPrice} derived from maxNightlyPrice (${settings.maxNightlyPrice}) ` +
        `and maxTotalSurchargePercent (${settings.maxTotalSurchargePercent}); lower it in the same request`,
    );
  }

  //* بزرگ‌ترین مقدار ذخیره‌شده = Booking.totalPrice (جمع قیمت شب‌ها). ستون int4 است.
  if (settings.maxBookingLength * settings.maxNightlyPrice > INT4_MAX) {
    throw invalid(
      `maxBookingLength (${settings.maxBookingLength}) × maxNightlyPrice ` +
        `(${settings.maxNightlyPrice}) exceeds the maximum integer ${INT4_MAX} supported for booking totals`,
    );
  }
}

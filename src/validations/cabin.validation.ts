import { z } from "zod";

import { safeNumber } from "../utils/safeParseNumber.js";
import { safeArray } from "../utils/safeArray.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import { addDaysUtc, todayInTimezone } from "../utils/date.util.js";
import { dateOnlySchema } from "./shared.validation.js";
import type { AppSettings } from "../types/setting.types.js";

import { paginationQueryValidation } from "./pagination.validation.js";
import { categorySlugQueryValidation } from "./category.validation.js";

// -------------------------------------
// Cabin Body
// -------------------------------------

/**
 * بدنه‌ی کابین به تنظیمات مؤثر وابسته است: کران‌های `regularPrice` از جدول
 * `Setting` می‌آیند، پس اسکیما یک factory است (نه مقدار ثابت در زمان import).
 */
function buildCabinBodySchema(settings: AppSettings) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, { message: "Name must be at least 2 characters" })
      .max(100, { message: "Name cannot exceed 100 characters" }),

    maxCapacity: z.preprocess(
      safeNumber,
      z
        .number()
        .int({ message: "Capacity must be an integer" })
        .min(1, { message: "Minimum capacity is 1 person" })
        .max(50, { message: "Maximum capacity is 50 persons" }),
    ),

    regularPrice: z.preprocess(
      safeNumber,
      z
        .number()
        .int({ message: "Price must be an integer" })
        .min(settings.minRegularPrice, {
          message: `Price cannot be less than ${settings.minRegularPrice}`,
        })
        .max(settings.maxRegularPrice, {
          message: `Price cannot exceed ${settings.maxRegularPrice}`,
        }),
    ),

    description: z.string().trim().max(1000, {
      message: "Description cannot exceed 1000 characters",
    }),

    amenities: z.preprocess(safeArray, z.array(z.string().trim().min(1)).default([])),

    bedrooms: z.preprocess(
      safeNumber,
      z
        .number()
        .int({ message: "Bedrooms must be an integer" })
        .min(0, { message: "Bedrooms cannot be negative" }),
    ),

    bathrooms: z.preprocess(
      safeNumber,
      z
        .number()
        .int({ message: "Bathrooms must be an integer" })
        .min(0, { message: "Bathrooms cannot be negative" }),
    ),

    areaSqm: z.preprocess(
      safeNumber,
      z.number().positive({
        message: "Area must be greater than 0",
      }),
    ),

    latitude: z
      .preprocess(
        safeNumber,
        z
          .number()
          .min(-90, {
            message: "Latitude must be between -90 and 90",
          })
          .max(90, {
            message: "Latitude must be between -90 and 90",
          }),
      )
      .default(1),

    longitude: z
      .preprocess(
        safeNumber,
        z
          .number()
          .min(-180, {
            message: "Longitude must be between -180 and 180",
          })
          .max(180, {
            message: "Longitude must be between -180 and 180",
          }),
      )
      .default(1),

    cityId: z.preprocess(
      safeNumber,
      z
        .number()
        .int({ message: "City ID must be an integer" })
        .positive({ message: "City ID must be greater than 0" }),
    ),

    keepExistingImages: z.preprocess(
      safeArray,
      z.array(z.url({ message: "Invalid image URL" })).default([]),
    ),
  });
}

/** تایپ ورودی create/update کابین — مستقل از تنظیمات، فقط برای inference. */
export type CreateCabinInput = z.infer<ReturnType<typeof buildCabinBodySchema>>;
export type UpdateCabinInput = Partial<CreateCabinInput>;

// -------------------------------------
// Params
// -------------------------------------

const idParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, {
      message: "ID must be a number",
    })
    .transform(Number),
});

// -------------------------------------
// Query Helpers
// -------------------------------------

function parseAmenitiesQuery(value: unknown): unknown {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}

// -------------------------------------
// Price
// -------------------------------------

const priceRangeSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?$/, {
    message: 'Price must be in "min-max" format (e.g. "100-500")',
  })
  .transform((val) => {
    const [rawMin, rawMax] = val.split("-").map((part) => part.trim());

    return {
      min: Number(rawMin),
      max: Number(rawMax),
    };
  })
  .pipe(
    z
      .object({
        min: z
          .number()
          .finite({
            message: "Price min must be a valid number",
          })
          .min(0, {
            message: "Price min cannot be negative",
          }),

        max: z
          .number()
          .finite({
            message: "Price max must be a valid number",
          })
          .min(0, {
            message: "Price max cannot be negative",
          }),
      })
      .refine((range) => range.min <= range.max, {
        message: "Price min cannot be greater than max",
      }),
  );

// -------------------------------------
// Cabin Filters
// -------------------------------------

const optionalPositiveInt = (label: string) =>
  z.preprocess(
    safeNumber,
    z
      .number({ message: `${label} must be a number` })
      .int({ message: `${label} must be an integer` })
      .positive({ message: `${label} must be greater than 0` })
      .optional(),
  );

const cabinFiltersSchema = z.object({
  guests: z.preprocess(
    safeNumber,
    z
      .number({
        message: "Guests must be a number",
      })
      .int({
        message: "Guests must be an integer",
      })
      .min(1, {
        message: "Guests must be at least 1",
      })
      .optional(),
  ),

  bedrooms: z.preprocess(
    safeNumber,
    z
      .number({
        message: "Bedrooms must be a number",
      })
      .int({
        message: "Bedrooms must be an integer",
      })
      .min(0, {
        message: "Bedrooms cannot be negative",
      })
      .optional(),
  ),

  amenities: z.preprocess(
    parseAmenitiesQuery,
    z
      .array(
        z.string().trim().min(1, {
          message: "Amenity cannot be empty",
        }),
      )
      .min(1, {
        message: "At least one amenity is required",
      })
      .optional(),
  ),

  price: priceRangeSchema.optional(),

  //* فیلتر جمع کل صورت‌حساب — فقط همراه با تاریخ‌ها معتبر است.
  totalPrice: priceRangeSchema.optional(),

  startDate: dateOnlySchema.optional(),

  endDate: dateOnlySchema.optional(),

  sort: z.enum(["price_asc", "price_desc"]).optional(),

  cityId: optionalPositiveInt("City ID"),

  regionId: optionalPositiveInt("Region ID"),

  // Legacy alias: `?city=` is still accepted and behaves exactly like `?cityId=`.
  city: optionalPositiveInt("City"),
});

// -------------------------------------
// All Cabin Queries
// -------------------------------------

/** قواعد تاریخ/طول اقامت فیلتر کابین از تنظیمات مؤثر می‌آید → factory. */
function buildCabinQuerySchema(settings: AppSettings) {
  return z
    .object({
      ...paginationQueryValidation.query.shape,
      ...categorySlugQueryValidation.query.shape,
      ...cabinFiltersSchema.shape,
    })
    .superRefine((value, ctx) => {
      const hasStart = value.startDate !== undefined;
      const hasEnd = value.endDate !== undefined;

      //* startDate و endDate فقط با هم یا هیچ‌کدام.
      if (hasStart !== hasEnd) {
        ctx.addIssue({
          code: "custom",
          message: "startDate and endDate must be provided together",
          path: [hasStart ? "endDate" : "startDate"],
        });
        return;
      }

      //* totalPrice و price با هم مجاز نیستند.
      if (value.price !== undefined && value.totalPrice !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "price and totalPrice cannot be used together",
          path: ["totalPrice"],
        });
      }

      //* totalPrice فقط همراه با تاریخ‌ها معتبر است.
      if (value.totalPrice !== undefined && !hasStart) {
        ctx.addIssue({
          code: "custom",
          message: "totalPrice requires startDate and endDate",
          path: ["totalPrice"],
        });
      }

      if (hasStart && hasEnd) {
        const today = todayInTimezone(TIMEZONE);
        const start = value.startDate as Date;
        const end = value.endDate as Date;

        if (start.getTime() < today.getTime()) {
          ctx.addIssue({
            code: "custom",
            message: "startDate cannot be in the past",
            path: ["startDate"],
          });
        }

        if (end.getTime() <= start.getTime()) {
          ctx.addIssue({
            code: "custom",
            message: "endDate must be after startDate",
            path: ["endDate"],
          });
        }

        if (end.getTime() > addDaysUtc(today, settings.maxAdvanceBookingDays).getTime()) {
          ctx.addIssue({
            code: "custom",
            message: `endDate cannot be more than ${settings.maxAdvanceBookingDays} days in the future`,
            path: ["endDate"],
          });
        }

        const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
        if (nights < settings.minBookingLength || nights > settings.maxBookingLength) {
          ctx.addIssue({
            code: "custom",
            message: `Stay must be between ${settings.minBookingLength} and ${settings.maxBookingLength} nights`,
            path: ["endDate"],
          });
        }
      }
    })
    .transform(({ city, cityId, ...rest }) => {
      // `cityId` is the canonical parameter; `city` is kept as a legacy alias.
      const resolvedCityId = cityId ?? city;

      return {
        ...rest,
        ...(resolvedCityId !== undefined && { cityId: resolvedCityId }),
      };
    });
}

// -------------------------------------
// Exported Validations
// -------------------------------------

export const createCabinSchema = (settings: AppSettings) => ({
  body: buildCabinBodySchema(settings),
});

export const updateCabinSchema = (settings: AppSettings) => ({
  body: buildCabinBodySchema(settings).partial(),
  params: idParamsSchema,
});

export const getCabinSchema = {
  params: idParamsSchema,
};

export const deleteCabinSchema = {
  params: idParamsSchema,
};

export const listCabinsQueryValidation = (settings: AppSettings) => ({
  query: buildCabinQuerySchema(settings),
});

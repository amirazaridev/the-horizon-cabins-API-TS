import { z } from "zod";

import { safeNumber } from "../utils/safeParseNumber.js";
import { safeArray } from "../utils/safeArray.js";

import { paginationQueryValidation } from "./pagination.validation.js";
import { categorySlugQueryValidation } from "./category.validation.js";

// -------------------------------------
// Cabin Body
// -------------------------------------

const cabinBodySchema = z.object({
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
      .min(0, { message: "Price cannot be negative" })
      .max(100_000_000, {
        message: "Price cannot exceed 100,000,000",
      }),
  ),

  discount: z
    .preprocess(
      safeNumber,
      z
        .number()
        .int({ message: "Discount must be an integer" })
        .min(0, { message: "Discount cannot be negative" })
        .max(100, { message: "Discount cannot exceed 100%" }),
    )
    .default(0),

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

  city: z.preprocess(
    safeNumber,
    z
      .number({
        message: "City must be a number",
      })
      .int({
        message: "City must be an integer",
      })
      .positive({
        message: "City must be greater than 0",
      })
      .optional(),
  ),
});

// -------------------------------------
// All Cabin Queries
// -------------------------------------

const cabinQuerySchema = z
  .object({
    ...paginationQueryValidation.query.shape,
    ...categorySlugQueryValidation.query.shape,
    ...cabinFiltersSchema.shape,
  })
  .transform(({ city, ...rest }) => ({
    ...rest,

    ...(city !== undefined
      ? {
          cityId: city,
        }
      : {}),
  }));

// -------------------------------------
// Exported Validations
// -------------------------------------

export const createCabinSchema = {
  body: cabinBodySchema,
};

export const updateCabinSchema = {
  body: cabinBodySchema.partial(),
  params: idParamsSchema,
};

export const getCabinSchema = {
  params: idParamsSchema,
};

export const deleteCabinSchema = {
  params: idParamsSchema,
};

export const listCabinsQueryValidation = {
  query: cabinQuerySchema,
};

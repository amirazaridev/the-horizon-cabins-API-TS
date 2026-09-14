import { z } from "zod";

import { safeNumber } from "../utils/safeParseNumber.js";

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

  amenities: z.array(z.string().trim().min(1)).default([]),

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
    z.number().positive({ message: "Area must be greater than 0" }),
  ),

  latitude: z.preprocess(
    safeNumber,
    z
      .number()
      .min(-90, { message: "Latitude must be between -90 and 90" })
      .max(90, { message: "Latitude must be between -90 and 90" }),
  ).default(1).optional(),

  longitude: z.preprocess(
    safeNumber,
    z
      .number()
      .min(-180, {
        message: "Longitude must be between -180 and 180",
      })
      .max(180, {
        message: "Longitude must be between -180 and 180",
      }),
  ).default(1).optional(),

  cityId: z.preprocess(
    safeNumber,
    z
      .number()
      .int({ message: "City ID must be an integer" })
      .positive({ message: "City ID must be greater than 0" }),
  ),

  images: z
    .array(z.string().url({ message: "Invalid image URL" }))
    .min(1, { message: "At least one image is required" }).optional(),
    
  keepExistingImages: z.array(z.string().url({ message: "Invalid image URL" })).default([]),
});

const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

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

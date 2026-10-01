import { z } from "zod";

import { safeNumber } from "../utils/safeParseNumber.js";

// -------------------------------------
// Helpers
// -------------------------------------

const cityNameSchema = z
  .string()
  .trim()
  .min(1, { message: "City name is required" })
  .max(100, { message: "City name cannot exceed 100 characters" });

const regionIdSchema = z.preprocess(
  safeNumber,
  z
    .number({ message: "Region ID must be a number" })
    .int({ message: "Region ID must be an integer" })
    .positive({ message: "Region ID must be greater than 0" }),
);

// -------------------------------------
// Schemas
// -------------------------------------

const cityBodySchema = z.object({
  name: cityNameSchema,
  regionId: regionIdSchema,
});

const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

const regionIdParamsSchema = z.object({
  regionId: z
    .string()
    .regex(/^\d+$/, { message: "Region ID must be a number" })
    .transform(Number),
});

// -------------------------------------
// Exported Validations
// -------------------------------------

export const createCitySchema = {
  body: cityBodySchema,
};

export const updateCitySchema = {
  body: cityBodySchema.partial(),
  params: idParamsSchema,
};

export const deleteCitySchema = {
  params: idParamsSchema,
};

export const regionCitiesSchema = {
  params: regionIdParamsSchema,
};

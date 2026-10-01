import { z } from "zod";

import { safeNumber } from "../utils/safeParseNumber.js";
import { isValidIcon } from "../utils/valid-icons.util.js";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(slugRegex, { message: "Slug must be kebab-case (e.g. villa-jangali)" });

export const categorySlugQueryValidation = {
  query: z.object({
    category: slugSchema.optional(),
  }),
};

const categoryBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: "Title is required" })
    .max(100, { message: "Title cannot exceed 100 characters" }),

  slug: z
    .string()
    .trim()
    .min(1, { message: "Slug is required" })
    .max(100, { message: "Slug cannot exceed 100 characters" })
    .regex(slugRegex, { message: "Slug must be kebab-case (e.g. villa-jangali)" }),

  icon: z
    .string()
    .trim()
    .min(1, { message: "Icon is required" })
    .refine(isValidIcon, { message: "Invalid icon name" }),

  displayOrder: z.preprocess(
    safeNumber,
    z
      .number()
      .int({ message: "Display order must be an integer" })
      .min(0, { message: "Display order cannot be negative" })
      .default(0),
  ),
});

const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

const assignCategoriesBodySchema = z.object({
  categoryIds: z
    .array(z.number().int().positive())
    .min(1, { message: "At least one category ID is required" }),
});

const cabinCategoryParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
  categoryId: z
    .string()
    .regex(/^\d+$/, { message: "Category ID must be a number" })
    .transform(Number),
});

export const createCategorySchema = {
  body: categoryBodySchema,
};

export const updateCategorySchema = {
  body: categoryBodySchema.partial(),
  params: idParamsSchema,
};

export const getCategorySchema = {
  params: idParamsSchema,
};

export const deleteCategorySchema = {
  params: idParamsSchema,
};

export const assignCategoriesSchema = {
  body: assignCategoriesBodySchema,
};

export const cabinCategoryIdParamsSchema = {
  params: cabinCategoryParamsSchema,
};

import { z } from 'zod';
import { safeNumber } from '../utils/safeParseNumber.js';

const cabinBodySchema = z.object({
  name: z
    .string()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(100, { message: 'Name cannot exceed 100 characters' })
    .trim(),

  maxCapacity: z.preprocess(
    safeNumber,
    z
      .number()
      .int({ message: 'Capacity must be an integer' })
      .min(1, { message: 'Minimum capacity is 1 person' })
      .max(50, { message: 'Maximum capacity is 50 persons' }),
  ),

  regularPrice: z.preprocess(
    safeNumber,
    z
      .number()
      .int({ message: 'Price must be an integer' })
      .min(0, { message: 'Price cannot be negative' })
      .max(100_000_000, { message: 'Price cannot exceed 100,000,000' }),
  ),

  discount: z.preprocess(
    safeNumber,
    z
      .number()
      .int({ message: 'Discount must be an integer' })
      .min(0, { message: 'Discount cannot be negative' }),
  ).default(0),

  description: z.string().max(1000, { message: 'Description cannot exceed 1000 characters' }),

  amenities: z.array(z.string().min(1)).default([]),

  bedrooms: z.preprocess(
    safeNumber,
    z.number().int().min(0, { message: 'Bedrooms cannot be negative' }),
  ),

  bathrooms: z.preprocess(
    safeNumber,
    z.number().int().min(0, { message: 'Bathrooms cannot be negative' }),
  ),

  areaSqm: z.preprocess(
    safeNumber,
    z.number().positive({ message: 'Area must be greater than 0' }),
  ),

  images: z
    .array(z.string().url({ message: 'Invalid image URL' }))
    .min(1, { message: 'At least one image is required' }),
});

const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: 'ID must be a number' }).transform(Number),
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
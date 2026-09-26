import { z } from "zod";

import { safeNumber } from "../utils/safeParseNumber.js";

const paginationQuerySchema = z.object({
  page: z.preprocess(safeNumber, z.number().int().min(1).default(1)),
  limit: z.preprocess(safeNumber, z.number().int().min(1).max(100).default(10)),
});

export const paginationQueryValidation = {
  query: paginationQuerySchema,
};

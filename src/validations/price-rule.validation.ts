import { z } from "zod";
import { safeNumber } from "../utils/safeParseNumber.js";
import {
  cabinIdParamsSchema,
  dateOnlySchema,
  idParamsSchema,
  safeBoolean,
} from "./shared.validation.js";
import type { AppSettings } from "../types/setting.types.js";

const ruleTypeSchema = z.enum(["discount", "surcharge"]);
const ruleKindSchema = z.enum(["dateRange", "weekday"]);

const percentSchema = z.preprocess(
  safeNumber,
  z
    .number({ message: "percent must be a number" })
    .int({ message: "percent must be an integer" })
    .min(1, { message: "percent must be at least 1" })
    .max(100, { message: "percent cannot exceed 100" }),
);

const weekdaysSchema = z
  .array(z.preprocess(safeNumber, z.number().int().min(1).max(7)))
  .min(1, { message: "At least one weekday is required" })
  .refine((days) => new Set(days).size === days.length, {
    message: "weekdays must not contain duplicates",
  });

const labelSchema = z.string().trim().max(100, { message: "label cannot exceed 100 characters" });

// -------------------------------------
// Create
// -------------------------------------

/**
 * سقف مجموع درصد تخفیف/افزایش از تنظیمات مؤثر می‌آید → factory.
 * فقط روی قاعده‌ی فعلی (`percent`) و نوعش چک می‌کند؛ سقفِ مجموع روی مجموعه‌ی
 * قواعد در سرویس (validateRuleSet) بررسی می‌شود.
 */
function buildCreatePriceRuleBodySchema(settings: AppSettings) {
  return z
    .object({
      type: ruleTypeSchema,
      kind: ruleKindSchema,
      percent: percentSchema,
      startDate: dateOnlySchema.optional(),
      endDate: dateOnlySchema.optional(),
      weekdays: weekdaysSchema.optional(),
      label: labelSchema.optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .superRefine((rule, ctx) => {
      if (rule.kind === "dateRange") {
        if (!rule.startDate) {
          ctx.addIssue({
            code: "custom",
            path: ["startDate"],
            message: "startDate is required for a dateRange rule",
          });
        }
        if (!rule.endDate) {
          ctx.addIssue({
            code: "custom",
            path: ["endDate"],
            message: "endDate is required for a dateRange rule",
          });
        }
        if (rule.weekdays !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["weekdays"],
            message: "weekdays must not be provided for a dateRange rule",
          });
        }
        // ⚠️ اگر اعتبارسنجی خودِ فیلد رد شده باشد، مقدار همچنان رشته است؛
        // مقایسه‌ی تاریخ فقط وقتی هر دو مقدار واقعاً Date باشند انجام می‌شود.
        if (
          rule.startDate instanceof Date &&
          rule.endDate instanceof Date &&
          rule.startDate.getTime() > rule.endDate.getTime()
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["endDate"],
            message: "startDate must be before or equal to endDate",
          });
        }
      } else {
        if (!rule.weekdays) {
          ctx.addIssue({
            code: "custom",
            path: ["weekdays"],
            message: "weekdays is required for a weekday rule",
          });
        }
        if (rule.startDate !== undefined || rule.endDate !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["startDate"],
            message: "startDate/endDate must not be provided for a weekday rule",
          });
        }
      }

      const cap =
        rule.type === "discount"
          ? settings.maxTotalDiscountPercent
          : settings.maxTotalSurchargePercent;
      if (rule.percent > cap) {
        ctx.addIssue({
          code: "custom",
          path: ["percent"],
          message: `percent cannot exceed ${cap} for a ${rule.type} rule`,
        });
      }
    });
}

export type CreatePriceRuleInput = z.infer<ReturnType<typeof buildCreatePriceRuleBodySchema>>;

// -------------------------------------
// Update (cabinId / type / kind immutable)
// -------------------------------------

export const updatePriceRuleBodySchema = z
  .object({
    percent: percentSchema.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    weekdays: weekdaysSchema.optional(),
    label: labelSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdatePriceRuleInput = z.infer<typeof updatePriceRuleBodySchema>;

// -------------------------------------
// Bulk (owner only)
// -------------------------------------

function buildBulkCreatePriceRulesBodySchema(settings: AppSettings) {
  return z
    .object({
      cabinIds: z.array(z.preprocess(safeNumber, z.number().int().positive())).min(1).optional(),
      allCabins: z.literal(true).optional(),
      rule: buildCreatePriceRuleBodySchema(settings),
    })
    .strict()
    .refine((body) => (body.cabinIds !== undefined) !== (body.allCabins !== undefined), {
      message: "Exactly one of cabinIds or allCabins must be provided",
      path: ["cabinIds"],
    });
}

export type BulkCreatePriceRulesInput = z.infer<
  ReturnType<typeof buildBulkCreatePriceRulesBodySchema>
>;

// -------------------------------------
// Query / Params
// -------------------------------------

export const listPriceRulesQuerySchema = z.object({
  type: ruleTypeSchema.optional(),
  kind: ruleKindSchema.optional(),
  isActive: z.preprocess(safeBoolean, z.boolean().optional()),
});

export const listCabinPriceRulesSchema = {
  params: cabinIdParamsSchema,
  query: listPriceRulesQuerySchema,
};

export const createCabinPriceRuleSchema = (settings: AppSettings) => ({
  params: cabinIdParamsSchema,
  body: buildCreatePriceRuleBodySchema(settings),
});

export const updatePriceRuleSchema = {
  params: idParamsSchema,
  body: updatePriceRuleBodySchema,
};

export const priceRuleIdSchema = { params: idParamsSchema };

export const bulkCreatePriceRulesSchema = (settings: AppSettings) => ({
  body: buildBulkCreatePriceRulesBodySchema(settings),
});

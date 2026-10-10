import { z } from "zod";

/**
 * اعتبارسنجی‌های مشترک بین ماژول‌ها.
 *
 * ⚠️ `dateOnlySchema` تنها منبع اعتبارسنجی «تاریخ تقویمی» است و هم در
 * رزرو (booking.validation) و هم در قیمت‌گذاری (price-rule.validation) و
 * هم در کوئری تقویم قیمت استفاده می‌شود — کپی جداگانه نداریم.
 */

/** `YYYY-MM-DD` → `Date` نیمه‌شب UTC (شکل ذخیره‌سازی ستون‌های DATE). */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

/** پارامتر مسیر `:id` عددی. */
export const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

/** پارامتر مسیر `:cabinId` عددی. */
export const cabinIdParamsSchema = z.object({
  cabinId: z.string().regex(/^\d+$/, { message: "ID must be a number" }).transform(Number),
});

/** پارس امن boolean از query string ("true"/"false"/"1"/"0"). */
export function safeBoolean(value: unknown): unknown {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}

/**
 * تبدیل یک پارامتر کوئری چندمقداری به آرایه‌ی رشته‌های غیرخالی.
 *
 * پشتیبانی از هر دو شکل: CSV (`?x=1,2,3`) و تکرارشده (`?x=1&x=2`).
 * مقدار خالی/غایب ⇒ `undefined` تا معنای «بدون فیلتر» حفظ شود.
 */
export function csvToArray(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;

  const parts = Array.isArray(raw) ? raw : [raw];
  const items = parts
    .flatMap((part) => (typeof part === "string" ? part.split(",") : part))
    .map((item) => String(item).trim())
    .filter(Boolean);

  return items.length ? items : undefined;
}

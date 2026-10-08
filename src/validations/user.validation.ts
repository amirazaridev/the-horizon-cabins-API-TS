import { z } from "zod";
import { Gender } from "../generated/prisma/enums.js";
import { dateOnlySchema } from "./shared.validation.js";

/**
 * اعتبارسنجی ویرایش پروفایل کاربر (`PATCH /user/me`).
 *
 * ⚠️ فقط فیلدهای پروفایل مهمان قابل ویرایش‌اند. `email`/`role`/`password`
 * عمداً اینجا نیستند (جلوگیری از Mass Assignment): ایمیل هویت حساب است و از
 * مسیر تایید ایمیل/بازیابی رمز عوض می‌شود، نه از این اندپوینت.
 *
 * ⚠️ قرارداد «فیلد غایب» در مقابل «فیلد خالی»:
 *   - غایب (`undefined`)  ⇒ دست‌نخورده بماند (PATCH واقعاً جزئی).
 *   - خالی (`""` یا `null`) ⇒ مقدار پاک شود (`null` در ستون‌های nullable).
 * این تفکیک لازم است چون UI همیشه همه‌ی فیلدها را می‌فرستد؛ ولی مصرف‌کننده‌ی
 * دیگر می‌تواند فقط یک فیلد را تغییر دهد و بقیه را تصادفی پاک نکند.
 */

const PHONE_PATTERN = /^09\d{9}$/;
const NATIONAL_ID_PATTERN = /^\d{10}$/;

/** رشته‌ی اختیاری: غایب ⇒ `undefined`، خالی/`null` ⇒ `null`، وگرنه trim‌شده. */
const optionalClearableText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });

const phoneNumberSchema = optionalClearableText.refine(
  (value) => value === undefined || value === null || PHONE_PATTERN.test(value),
  { message: "Phone number must be 11 digits starting with 09" },
);

const nationalIdSchema = optionalClearableText.refine(
  (value) => value === undefined || value === null || NATIONAL_ID_PATTERN.test(value),
  { message: "National ID must be exactly 10 digits" },
);

/**
 * تاریخ تولد اختیاری.
 *
 * ⚠️ `dateOnlySchema` مشترک را داخل union می‌گذاریم تا اعتبارسنجی «تاریخ
 * تقویمی واقعی» دوباره نوشته نشود؛ `""`/`null` هم یعنی «پاک کن».
 */
const dateOfBirthSchema = z
  .union([dateOnlySchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return value;
  });

const updateProfileBodySchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, { message: "Full name must be between 3 and 100 characters" })
    .max(100, { message: "Full name must be between 3 and 100 characters" }),
  phoneNumber: phoneNumberSchema,
  nationalId: nationalIdSchema,
  dateOfBirth: dateOfBirthSchema,
  gender: z.enum(Gender).nullable().optional(),
});

export const updateProfileSchema = { body: updateProfileBodySchema };

export type UpdateProfileInput = z.infer<typeof updateProfileBodySchema>;

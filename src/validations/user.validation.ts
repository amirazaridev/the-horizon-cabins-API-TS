import { z } from "zod";
import { Gender, UserRole } from "../generated/prisma/enums.js";
import { safeNumber } from "../utils/safeParseNumber.js";
import { dateOnlySchema, idParamsSchema, safeBoolean } from "./shared.validation.js";

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

/* ==========================================================================
   پنل مدیریت کاربران
   ========================================================================== */

/**
 * کوئری لیست کاربران.
 *
 * ⚠️ `q` حداقل ۲ کاراکتر است تا جستجوی تک‌حرفی کل جدول را برنگرداند
 * (همان قراردادی که فیلتر رزروها دارد).
 */
const listUsersQuerySchema = z.object({
  page: z.preprocess(safeNumber, z.number().int().min(1).default(1)),
  limit: z.preprocess(safeNumber, z.number().int().min(1).max(100).default(10)),
  q: z.string().trim().min(2).max(100).optional(),
  active: z.preprocess(safeBoolean, z.boolean().optional()),
});

export const listUsersQueryValidation = { query: listUsersQuerySchema };

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** بدنه‌ی فعال/غیرفعال‌کردن حساب. */
const updateUserStatusBodySchema = z.object({
  active: z.boolean(),
});

export const updateUserStatusSchema = {
  params: idParamsSchema,
  body: updateUserStatusBodySchema,
};

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusBodySchema>;

/**
 * بدنه‌ی تغییر نقش.
 *
 * ⚠️ مقادیر مجاز همان enum بک‌اند (`user_role`) است؛ نقش‌های حساس
 * (admin/owner) از همین‌جا پذیرفته می‌شوند و کنترل دسترسی در لایه‌ی route
 * با `restrictTo("owner")` اعمال می‌شود.
 */
const updateUserRoleBodySchema = z.object({
  role: z.enum(UserRole),
});

export const updateUserRoleSchema = {
  params: idParamsSchema,
  body: updateUserRoleBodySchema,
};

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleBodySchema>;

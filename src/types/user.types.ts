// src/types/user.types.ts
import type { Prisma } from "../generated/prisma/client.js";

export type SafeUser = Prisma.UserGetPayload<{ omit: { password: true } }>;

/**
 * `select` مشترک پاسخ‌های مدیریتی کاربران.
 *
 * ⚠️ `password` هرگز انتخاب نمی‌شود و فقط فیلدهای لازم برای جدول داشبورد +
 * پروفایل مهمان برمی‌گردند (اصل «حداقل افشا»). همین یک منبع، هم برای لیست و
 * هم برای پاسخ عملیات (فعال/غیرفعال، تغییر نقش) استفاده می‌شود تا شکل پاسخ
 * یکدست بماند.
 */
export const adminUserSelect = {
  id: true,
  email: true,
  role: true,
  active: true,
  lastLoginAttempt: true,
  lockedUntil: true,
  createdAt: true,
  guest: {
    select: {
      id: true,
      fullName: true,
      phoneNumber: true,
      nationalId: true,
      dateOfBirth: true,
      gender: true,
    },
  },
} satisfies Prisma.UserSelect;

/** شکل یک ردیف کاربر در پنل مدیریت (نوع از همان `select` مشتق می‌شود). */
export type AdminUser = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

/**
 * فیلترهای لیست کاربران پنل مدیریت.
 *
 * ⚠️ دامنه‌ی لیست همیشه «مهمان‌ها» است (نقش `guest`) و اینجا فقط
 * محدودسازی‌های روی همان مجموعه می‌آید؛ فیلتر نقش لازم نیست.
 */
export interface UserFilters {
  /** جستجو روی ایمیل کاربر یا نام/تلفن مهمان (حداقل ۲ کاراکتر). */
  q?: string;
  /** وضعیت حساب: فعال/غیرفعال. */
  active?: boolean;
}

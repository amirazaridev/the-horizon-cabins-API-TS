// src/types/user.types.ts
import type { Prisma } from "../generated/prisma/client.js";
import type { UserRole } from "../generated/prisma/enums.js";

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
 * `roles` دامنه‌ی لیست را تعیین می‌کند: صفحه‌ی «افراد و مهمانان» مقدار
 * `["guest"]` و صفحه‌ی «مدیران» مقدار `["admin","owner"]` می‌فرستد. اگر
 * نیامده باشد، پیش‌فرض `["guest"]` است (رفتار قبلی حفظ می‌شود).
 */
export interface UserFilters {
  /** جستجو روی ایمیل کاربر یا نام/تلفن مهمان (حداقل ۲ کاراکتر). */
  q?: string;
  /** وضعیت حساب: فعال/غیرفعال. */
  active?: boolean;
  /** نقش‌های داخل لیست. */
  roles?: UserRole[];
}

/** بازیگر یک عملیات مدیریتی — از `req.user` می‌آید. */
export interface UserActor {
  id: number;
  role: UserRole;
}

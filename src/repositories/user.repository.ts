import { prisma } from "../config/database.js";
import { Prisma, User } from "../generated/prisma/client.js";
import type { UserRole } from "../generated/prisma/enums.js";
import { adminUserSelect, type AdminUser, type UserFilters } from "../types/user.types.js";
import type { SafeUser } from "../types/user.types.js";

export async function incrementLoginAttemptsWithLock(
  userId: number,
  maxAttempts: number,
  lockDurationMs: number,
): Promise<SafeUser> {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        loginAttempts: { increment: 1 },
        lastLoginAttempt: new Date(),
      },
    });

    if (user.loginAttempts >= maxAttempts) {
      return await tx.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + lockDurationMs) },
      });
    }

    return user;
  });
}

export async function resetLoginAttempts(userId: number): Promise<SafeUser> {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      loginAttempts: 0,
      lastLoginAttempt: null,
      lockedUntil: null,
    },
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
    omit: { password: false },
  });
}

export async function findUserById(id: number): Promise<SafeUser | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: Prisma.UserCreateInput): Promise<SafeUser> {
  return prisma.user.create({ data });
}

/* ==========================================================================
   پنل مدیریت کاربران
   ========================================================================== */

/**
 * ساخت `where` لیست کاربران.
 *
 * ⚠️ دامنه‌ی لیست از `filters.roles` می‌آید (پیش‌فرض `["guest"]`) تا صفحه‌ی
 * «افراد و مهمانان» فقط مهمان‌ها و صفحه‌ی «مدیران» فقط admin/owner را ببیند.
 */
function buildUserWhereClause(filters: UserFilters): Prisma.UserWhereInput {
  const roles =
    filters.roles && filters.roles.length > 0 ? filters.roles : (["guest"] as const);

  const where: Prisma.UserWhereInput = { role: { in: [...roles] } };

  if (filters.active !== undefined) where.active = filters.active;

  if (filters.q) {
    //* جستجو روی ایمیل حساب یا نام/تلفن پروفایل مهمان — همه بدون حساسیت به بزرگی/کوچکی.
    where.OR = [
      { email: { contains: filters.q, mode: "insensitive" } },
      { guest: { is: { fullName: { contains: filters.q, mode: "insensitive" } } } },
      { guest: { is: { phoneNumber: { contains: filters.q } } } },
    ];
  }

  return where;
}

/** یک صفحه از کاربران + شمارش کل، با فیلترهای نقش/جستجو/وضعیت. */
export async function findManyUsers({
  skip,
  limit,
  filters,
}: {
  skip: number;
  limit: number;
  filters: UserFilters;
}): Promise<{ data: AdminUser[]; total: number }> {
  const where = buildUserWhereClause(filters);

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: adminUserSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, total };
}

/** یافتن یک کاربر (هر نقشی) با شناسه — برای اعمال گاردهای سیاست در سرویس. */
export async function findManagedUserById(id: number): Promise<AdminUser | null> {
  return prisma.user.findFirst({
    where: { id },
    select: adminUserSelect,
  });
}

/** شمارش مالکان — برای اعمال سقف «حداکثر دو مالک». */
export async function countOwners(): Promise<number> {
  return prisma.user.count({ where: { role: "owner" } });
}

/**
 * شمارش وابستگی‌هایی که حذف کاربر را ناممکن می‌کنند.
 *
 * ⚠️ FKهای `Booking.guest` و `PriceRule.createdBy/updatedBy` روی `Restrict`
 * هستند؛ پس قبل از حذف باید مطمئن شویم وگرنه Prisma خطای FK می‌دهد.
 */
export async function countUserDependencies(
  id: number,
): Promise<{ bookings: number; priceRules: number }> {
  const [bookings, priceRules] = await Promise.all([
    prisma.booking.count({ where: { guest: { userId: id } } }),
    prisma.priceRule.count({ where: { OR: [{ createdById: id }, { updatedById: id }] } }),
  ]);

  return { bookings, priceRules };
}

/** فعال/غیرفعال‌کردن حساب کاربر. */
export async function updateUserStatus(id: number, active: boolean): Promise<AdminUser> {
  return prisma.user.update({
    where: { id },
    data: { active },
    select: adminUserSelect,
  });
}

/** تغییر نقش کاربر. */
export async function updateUserRole(id: number, role: UserRole): Promise<AdminUser> {
  return prisma.user.update({
    where: { id },
    data: { role },
    select: adminUserSelect,
  });
}

/** حذف کامل کاربر (پروفایل مهمان با Cascade حذف می‌شود). */
export async function deleteUserById(id: number): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

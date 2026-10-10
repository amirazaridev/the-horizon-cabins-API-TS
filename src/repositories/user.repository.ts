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
 * ⚠️ دامنه همیشه به نقش `guest` محدود است (صفحه‌ی «افراد و مهمانان»)؛ پس
 * مدیران/مالکان هرگز در این لیست نمی‌آیند و نیازی به فیلتر نقش نیست.
 */
function buildUserWhereClause(filters: UserFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: "guest" };

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

/** یک صفحه از کاربران مهمان + شمارش کل، با فیلترهای جستجو/وضعیت. */
export async function findAllGuests({
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

/**
 * یافتن یک کاربر **مهمان** با شناسه.
 *
 * ⚠️ محدود به `role: "guest"` است تا عملیات مدیریتی فقط روی همان دامنه‌ی
 * لیست اثر بگذارد و اشتباهاً روی admin/owner اعمال نشود.
 */
export async function findGuestById(id: number): Promise<AdminUser | null> {
  return prisma.user.findFirst({
    where: { id, role: "guest" },
    select: adminUserSelect,
  });
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

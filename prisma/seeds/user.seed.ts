import { prisma } from "../../src/config/database";
import type { UserRole } from "../../src/generated/prisma/enums";
import { users, SEED_USER_PASSWORD, type SeedUser } from "./data/user";

/** شناسه‌ی حساب‌های پایه به‌تفکیک نقش. */
export type SeededUserIds = Record<UserRole, number>;


async function ensureUser(role: UserRole, { email, guestFullName }: SeedUser): Promise<number> {
  const existing = await prisma.user.findUnique({ where: { email } });

  const reference = { password: SEED_USER_PASSWORD, role, active: true };

  const userId = existing
    ? (await prisma.user.update({ where: { id: existing.id }, data: reference })).id
    : (await prisma.user.create({ data: { email, ...reference } })).id;

  if (guestFullName) {
    const profile = await prisma.guest.findUnique({ where: { userId } });
    if (!profile) {
      await prisma.guest.create({ data: { userId, fullName: guestFullName } });
    }
  }

  return userId;
}

/**
 * seed حساب‌های پایه‌ی سیستم (owner/admin/guest) به‌همراه پروفایل مهمان.
 *
 * idempotent است: اجرای مجدد، حساب‌ها/پروفایل‌های موجود را با مقادیر مرجع
 * همگام می‌کند. خروجی، شناسه‌ی هر نقش است تا seedهای وابسته (مثل قواعد قیمت)
 * بتوانند بدون ساخت کاربر، به `owner` ارجاع بدهند.
 */
export async function seedUsers(): Promise<SeededUserIds> {
  const owner = await ensureUser("owner", users.owner);
  const admin = await ensureUser("admin", users.admin);
  const guest = await ensureUser("guest", users.guest);

  return { owner, admin, guest };
}

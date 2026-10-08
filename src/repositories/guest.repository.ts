import { prisma } from "../config/database.js";
import type { Guest, Prisma } from "../generated/prisma/client.js";

export async function createGuest(data: Prisma.GuestUncheckedCreateInput): Promise<Guest> {
  return await prisma.guest.create({ data });
}

export async function findGuestByUserId(userId: number) {
  return await prisma.guest.findUnique({
    where: { userId },
    omit: { createdAt: true, updatedAt: true },
  });
}

/**
 * به‌روزرسانی پروفایل مهمان بر اساس `userId`.
 *
 * ⚠️ `userId` روی مدل `Guest` یکتا است، پس می‌تواند مستقیماً در `where`
 * بیاید و نیازی به lookup جداگانه نیست. اگر رکورد نباشد Prisma خطای
 * P2025 می‌دهد که در لایه‌ی سرویس قبل از رسیدن به اینجا گرفته می‌شود.
 */
export async function updateGuestByUserId(
  userId: number,
  data: Prisma.GuestUpdateInput,
): Promise<Guest> {
  return await prisma.guest.update({
    where: { userId },
    data,
  });
}

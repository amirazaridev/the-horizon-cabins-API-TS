import { prisma } from '../config/database.js';
import type { Guest, Prisma } from '../generated/prisma/client.js';

export async function createGuest(data: Prisma.GuestUncheckedCreateInput): Promise<Guest> {
  return await prisma.guest.create({ data });
}

export async function findGuestByUserId(userId: number) {
  return await prisma.guest.findUnique({
    where: { userId },
    omit: { createdAt: true, updatedAt: true },
  });
}
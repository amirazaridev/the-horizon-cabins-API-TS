import { prisma } from "../config/database.js";
import { Prisma, User } from "../generated/prisma/client.js";
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

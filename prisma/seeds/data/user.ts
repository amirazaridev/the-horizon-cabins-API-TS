import type { UserRole } from "../../../src/generated/prisma/enums";

export const SEED_USER_PASSWORD = "12345678";

export interface SeedUser {
  email: string;

  guestFullName?: string;
}


export const users: Record<UserRole, SeedUser> = {
  owner: { email: "owner@horizon.local" },
  admin: { email: "admin@horizon.local" },
  guest: { email: "guest@horizon.local", guestFullName: "مهمان نمونه" },
};

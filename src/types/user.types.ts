// src/types/user.types.ts
import type { Prisma } from "../generated/prisma/client.js";

export type SafeUser = Prisma.UserGetPayload<{ omit: { password: true } }>;

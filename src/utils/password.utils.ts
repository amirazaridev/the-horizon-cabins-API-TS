// src/utils/password.utils.ts
import bcrypt from "bcryptjs";
import env from "../config/env.js";

export async function comparePassword(
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}


export function isPasswordChangedAfter(lastPasswordChange: Date, jwtIssuedAt: number): boolean {
  const changedTimestamp = Math.floor(lastPasswordChange.getTime() / 1000);
  return jwtIssuedAt < changedTimestamp;
}
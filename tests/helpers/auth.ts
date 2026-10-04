import { signToken } from "../../src/utils/jwt.utils.js";
import type { UserRole } from "../../src/generated/prisma/enums.js";

/**
 * ساخت هدر/کوکی احراز هویت برای تست‌های HTTP.
 *
 * `protect` توکن را از کوکی `jwt` می‌خواند (نه هدر Authorization)، پس
 * توکن را به‌صورت کوکی می‌فرستیم. برای supertest: `.set("Cookie", [cookieFor(...)])`.
 */
export function tokenFor(user: { id: number; role: UserRole }): string {
  return signToken(user.id, user.role);
}

/** مقدار کوکی آماده برای supertest. */
export function cookieFor(user: { id: number; role: UserRole }): string {
  return `jwt=${tokenFor(user)}`;
}

/** هدر Cookie. */
export function authCookieHeader(user: { id: number; role: UserRole }): [string, string] {
  return ["Cookie", cookieFor(user)];
}

/** سیستم می‌تواند توکن بدون کوکی را هم بفرستد؛ این شکل برای خوانایی است. */
export function bearerToken(user: { id: number; role: UserRole }): string {
  return `Bearer ${tokenFor(user)}`;
}

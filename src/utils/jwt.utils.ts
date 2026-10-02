import jwt, { type SignOptions } from "jsonwebtoken";
import env from "../config/env.js";
import type { UserRole } from "../generated/prisma/client.js";

/**
 * محتوای توکن JWT.
 *
 * `role` عمداً داخل توکن قرار می‌گیرد تا لایه‌ی BFF (Next.js) بتواند
 * در `proxy.ts` بدون کوئری به دیتابیس، مسیر درست کاربر را تشخیص دهد
 * (admin/owner → dashboard، guest → صفحه اصلی).
 */
export interface JwtPayload {
  id: number;
  role: UserRole;
  iat: number;
  exp: number;
}

export function signToken(id: number, role: UserRole): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN };
  return jwt.sign({ id, role }, env.JWT_SECRET, options);
}

export function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) return reject(err);
      resolve(decoded as JwtPayload);
    });
  });
}

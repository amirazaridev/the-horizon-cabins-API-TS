import jwt, { type SignOptions } from "jsonwebtoken";
import env from "../config/env.js";

export interface JwtPayload {
  id: number;
  iat: number;
  exp: number;
}

export function signToken(id: number): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN };
  return jwt.sign({ id }, env.JWT_SECRET, options);
}

export function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) return reject(err);
      resolve(decoded as JwtPayload);
    });
  });
}

import jwt from "jsonwebtoken";
import env from "../config/env.js";

export interface JwtPayload {
  id: number;
  iat: number;
  exp: number;
}

export function signToken(id: number): string {
  return jwt.sign({ id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) return reject(err);
      resolve(decoded as JwtPayload);
    });
  });
}

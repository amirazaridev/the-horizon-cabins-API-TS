import "dotenv/config";
import { z } from "zod";

// type NodeEnv = "development" | "production";

// const env = {
//   nodeEnv: (process.env.NODE_ENV as NodeEnv) ?? "development",
//   port: Number(process.env.PORT) || 3000,
//   databaseURL: process.env.DATABASE_URL,
//   bcryptSaltRound: Number(process.env.BCRYPT_SALT_ROUNDS),
// } as const;
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(9).max(15).default(10),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCK_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 1000),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 1000),
  JWT_COOKIE_EXPIRES_IN_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 60 * 1000),
});
const env = envSchema.parse(process.env);

export default env;

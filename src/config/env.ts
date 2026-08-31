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
});
const env = envSchema.parse(process.env);

export default env;

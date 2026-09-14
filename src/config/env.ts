import "dotenv/config";
import { z } from "zod";

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

  // 🆕 Supabase Storage
  SUPABASE_URL: z
    .string()
    .url({ message: "SUPABASE_URL must be a valid URL (https://xxxxx.supabase.co)" }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { message: "SUPABASE_SERVICE_ROLE_KEY is required" }),
  SUPABASE_BUCKET_CABINS: z.string().default("cabins"),
});

const env = envSchema.parse(process.env);

export default env;
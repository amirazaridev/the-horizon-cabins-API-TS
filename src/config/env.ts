import "dotenv/config";

type NodeEnv = "development" | "production";

const env = {
  nodeEnv: (process.env.NODE_ENV as NodeEnv) ?? "development",
  port: Number(process.env.PORT) || 3000,
  databaseURL: process.env.DATABASE_URL,
} as const;

export default env;

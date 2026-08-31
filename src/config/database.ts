import { PrismaPg } from "@prisma/adapter-pg";
import env from "./env.js";
import { PrismaClient } from "../generated/prisma/client.js";
import logger from "./logger.js";
import { hashPassword } from "../utils/password.utils.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  omit: {
    user: { password: true, loginAttempts: true, lockedUntil: true, lastLoginAttempt: true },
  },
  log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
}).$extends({
  query: {
    user: {
      async create({ args, query }) {
        const password = args.data.password;
        if (password) args.data.password = await hashPassword(password);
        return query(args);
      },
      async update({ args, query }) {
        const password = args.data.password;
        if (password) args.data.password = await hashPassword(password as string);
        return query(args);
      },
    },
  },
});

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error(`Database connection check failed. ${error}`);
    return false;
  }
};
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info("Database disconnected");
};

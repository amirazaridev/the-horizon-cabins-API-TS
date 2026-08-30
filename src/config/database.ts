import { PrismaPg } from "@prisma/adapter-pg";
import env from "./env.js";
import { PrismaClient } from "../generated/prisma/client.js";
import logger from "./logger.js";

const adapter = new PrismaPg({ connectionString: env.databaseURL });

export const prisma = new PrismaClient({
  adapter,
  log: env.nodeEnv === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error("Database connection check failed");
    return false;
  }
};
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info("Database disconnected");
};

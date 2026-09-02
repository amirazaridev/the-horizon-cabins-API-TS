import { prisma } from "../src/config/database";
import logger from "../src/config/logger";
import { seedCabins } from "./seeds/cabin.seed";

async function main() {
  logger.info("🌱 Seeding started...");

  await seedCabins();

  logger.info("✅ Seeding finished.");
}
/* eslint-disable n/no-process-exit */
main()
  .catch((error) => {
    logger.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

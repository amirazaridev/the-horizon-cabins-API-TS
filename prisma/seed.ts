import { prisma } from "../src/config/database";
import logger from "../src/config/logger";
import { seedRegions } from "./seeds/region.seed";
import { seedCabins } from "./seeds/cabin.seed";
import { seedCities } from "./seeds/city.seed";
import { seedCategories } from "./seeds/category.seed";
import { seedCabinCategories } from "./seeds/cabin-category.seed";
import { seedPriceRules } from "./seeds/price-rule.seed";
import { rebuildAllCabinPriceCalendars } from "../src/services/price-calendar.service";

/**
 * The seed data uses explicit primary keys, and PostgreSQL does not advance a
 * SERIAL sequence when ids are supplied explicitly. Without this re-alignment
 * the next autoincrement insert (for example POST /api/v1/locations/cities)
 * would fail with a duplicate-key error on id = 1.
 */
async function syncSequences(tables: string[]): Promise<void> {
  for (const table of tables) {
    await prisma.$queryRawUnsafe(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX("id") FROM "${table}"), 1))`,
      table,
    );
  }
}

async function main() {
  logger.info("🌱 Seeding started...");

  await seedRegions();
  await seedCities();
  await seedCategories();
  await seedCabins();
  await seedCabinCategories();

  const ruleCount = await seedPriceRules();
  const calendarRows = await rebuildAllCabinPriceCalendars();

  await syncSequences(["regions", "cities", "categories", "cabins"]);

  logger.info(
    `✅ Seeding finished. (${ruleCount} sample price rules, ${calendarRows} calendar rows)`,
  );
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

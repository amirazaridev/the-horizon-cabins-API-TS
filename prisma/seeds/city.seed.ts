import { cities } from "./data/city";
import { prisma } from "../../src/config/database";

export async function seedCities() {
  const upsertPromises = cities.map((city) =>
    prisma.city.upsert({
      where: { name: city.name },
      // Re-align the region on every run so pre-existing cities get their region assigned.
      update: { regionId: city.regionId },
      create: city,
    }),
  );

  await Promise.all(upsertPromises);
}

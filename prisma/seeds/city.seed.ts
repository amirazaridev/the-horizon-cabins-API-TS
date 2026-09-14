import { cities } from "./data/city";
import { prisma } from "../../src/config/database";

export async function seedCities() {
  const upsertPromises = cities.map((city) =>
    prisma.city.upsert({
      where: { name: city.name },
      update: {},
      create: city,
    }),
  );

  await Promise.all(upsertPromises);
}

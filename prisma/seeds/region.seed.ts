import { regions } from "./data/region";
import { prisma } from "../../src/config/database";

export async function seedRegions() {
  const upsertPromises = regions.map((region) =>
    prisma.region.upsert({
      where: { slug: region.slug },
      update: { name: region.name, displayOrder: region.displayOrder },
      create: region,
    }),
  );

  await Promise.all(upsertPromises);
}

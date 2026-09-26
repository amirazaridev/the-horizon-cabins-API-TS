import { prisma } from "../../src/config/database";
import { cabinCategories } from "./data/cabin-category";

export async function seedCabinCategories() {
  const upsertPromises = cabinCategories.map((cabinCategory) =>
    prisma.cabinCategory.upsert({
      where: {
        cabinId_categoryId: {
          cabinId: cabinCategory.cabinId,
          categoryId: cabinCategory.categoryId,
        },
      },
      update: {},
      create: cabinCategory,
    }),
  );

  await Promise.all(upsertPromises);
}
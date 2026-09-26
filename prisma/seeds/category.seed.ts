import { categories } from "./data/category";
import { prisma } from "../../src/config/database";

export async function seedCategories() {
  const upsertPromises = categories.map((category) =>
    prisma.category.upsert({
      where: { title: category.title },
      update: {},
      create: category,
    }),
  );

  await Promise.all(upsertPromises);
}
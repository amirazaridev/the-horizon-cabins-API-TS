import { cabins } from "./data/cabin";
import { prisma } from "../../src/config/database";

export async function seedCabins() {
  const upsertPromises = cabins.map((cabin) =>
    prisma.cabin.upsert({
      where: { name: cabin.name },
      update: {},
      create: cabin,
    }),
  );

  await Promise.all(upsertPromises);
}

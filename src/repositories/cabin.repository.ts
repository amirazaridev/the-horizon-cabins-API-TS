import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Cabin, City } from "../generated/prisma/client.js";
import { CabinWithCity } from "../types/cabin.types.js";

export async function findAllCabins({
  skip = 0,
  limit = 10,
  categorySlug,
}: { skip?: number; limit?: number; categorySlug?: string } = {}) {
  const where = categorySlug
    ? { categories: { some: { category: { slug: categorySlug } } } }
    : undefined;

  const [data, total] = await Promise.all([
    prisma.cabin.findMany({
      where,
      skip,
      take: limit,
      omit: {
        cityId: true,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.cabin.count({ where }),
  ]);
  return { data: data as CabinWithCity[], total };
}

export async function findCabinCategories(cabinId: number) {
  return prisma.cabinCategory.findMany({
    where: { cabinId },
    include: { category: true },
  });
}

export async function removeCabinCategory(cabinId: number, categoryId: number): Promise<void> {
  await prisma.cabinCategory.delete({
    where: { cabinId_categoryId: { cabinId, categoryId } },
  });
}

export async function setCategoriesForCabin(
  cabinId: number,
  categoryIds: number[],
): Promise<void> {
  await prisma.$transaction([
    prisma.cabinCategory.deleteMany({ where: { cabinId } }),
    prisma.cabinCategory.createMany({
      data: categoryIds.map((categoryId) => ({ cabinId, categoryId })),
    }),
  ]);
}
export async function findAllCities(): Promise<City[]> {
  return prisma.city.findMany();
}

export async function findCabinById(id: number): Promise<Cabin | null> {
  return prisma.cabin.findUnique({ where: { id } });
}

export async function createCabin(data: Prisma.CabinCreateInput): Promise<Cabin> {
  return prisma.cabin.create({ data });
}

export async function updateCabin(id: number, data: Prisma.CabinUpdateInput): Promise<Cabin> {
  return prisma.cabin.update({ where: { id }, data });
}

export async function deleteCabin(id: number): Promise<Cabin | null> {
  try {
    return await prisma.cabin.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null; // معادل deletedCount === 0 در Sequelize
    }
    throw error;
  }
}

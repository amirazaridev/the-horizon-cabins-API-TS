import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Cabin, City } from "../generated/prisma/client.js";

export async function findAllCabins({
  skip = 0,
  limit = 10,
}: { skip?: number; limit?: number } = {}) {
  const [data, total] = await Promise.all([
    prisma.cabin.findMany({
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
    prisma.cabin.count(),
  ]);
  return { data, total };
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

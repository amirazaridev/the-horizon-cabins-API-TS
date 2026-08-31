import { prisma } from '../config/database.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Cabin } from '../generated/prisma/client.js';

export async function findAllCabins(): Promise<Cabin[]> {
  return prisma.cabin.findMany();
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null; // معادل deletedCount === 0 در Sequelize
    }
    throw error;
  }
}
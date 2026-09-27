import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Cabin, City } from "../generated/prisma/client.js";
import { CabinFilters, CabinWithCity } from "../types/cabin.types.js";

interface FindAllCabinsParams {
  skip?: number;
  limit?: number;
  categorySlug?: string;
  filters?: CabinFilters;
}

function buildWhereClause(categorySlug?: string, filters?: CabinFilters): Prisma.CabinWhereInput {
  const conditions: Prisma.CabinWhereInput[] = [];

  if (categorySlug) {
    conditions.push({ categories: { some: { category: { slug: categorySlug } } } });
  }

  if (filters) {
    if (filters.guests !== undefined) {
      conditions.push({ maxCapacity: { gte: filters.guests } });
    }

    if (filters.bedrooms !== undefined) {
      conditions.push({ bedrooms: { gte: filters.bedrooms } });
    }

    if (filters.cityId !== undefined) {
      conditions.push({ cityId: filters.cityId });
    }

    if (filters.amenities && filters.amenities.length > 0) {
      conditions.push({ amenities: { hasEvery: filters.amenities } });
    }
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

export async function findAllCabins({
  skip = 0,
  limit = 10,
  categorySlug,
  filters,
}: FindAllCabinsParams = {}) {
  const where = buildWhereClause(categorySlug, filters);
  const needsPriceFilter = filters?.price !== undefined;

  if (needsPriceFilter) {
    const allCabins = await prisma.cabin.findMany({
      where,
      omit: { cityId: true },
      include: {
        city: {
          select: { id: true, name: true },
        },
      },
    });

    const { min, max } = filters.price!;
    const filtered = allCabins.filter((cabin) => {
      const finalPrice = cabin.regularPrice - cabin.discount;
      return finalPrice >= min && finalPrice <= max;
    });

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    return { data: paginated as CabinWithCity[], total };
  }

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

export async function setCategoriesForCabin(cabinId: number, categoryIds: number[]): Promise<void> {
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

export async function findAllAmenities(): Promise<string[]> {
  const cabins = await prisma.cabin.findMany({
    select: { amenities: true },
  });
  const amenities = cabins.flatMap((cabin) => cabin.amenities);
  return [...new Set(amenities)];
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
      return null;
    }
    throw error;
  }
}

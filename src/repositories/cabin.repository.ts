import { prisma, PrismaTransactionClient } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Cabin } from "../generated/prisma/client.js";
import { CabinFilters, CabinWithCity } from "../types/cabin.types.js";
import {
  enrichWithStartingPrice,
  findAllCabinsWithPricing,
  needsPricingPath,
} from "./cabin-search.repository.js";
import { DEFAULT_SETTINGS } from "../constants/setting.constants.js";

type Db = typeof prisma | PrismaTransactionClient;

interface FindAllCabinsParams {
  skip?: number;
  limit?: number;
  categorySlug?: string;
  filters?: CabinFilters;
  /** پنجره‌ی startingPrice؛ پیش‌فرض از مقادیر پیش‌فرض تنظیمات. */
  startingPriceWindowDays?: number;
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

    // Location filtering.
    // Priority: an explicit cityId narrows the result to a single city;
    // regionId is only used as a fallback and resolves through the City
    // relation, so it matches every cabin in any city of that region.
    if (filters.cityId !== undefined) {
      conditions.push({ cityId: filters.cityId });
    } else if (filters.regionId !== undefined) {
      conditions.push({ city: { regionId: filters.regionId } });
    }

    if (filters.amenities && filters.amenities.length > 0) {
      conditions.push({ amenities: { hasEvery: filters.amenities } });
    }
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

const cabinInclude = {
  omit: { cityId: true },
  include: { city: { select: { id: true, name: true } } },
} as const;

export async function findAllCabins({
  skip = 0,
  limit = 10,
  categorySlug,
  filters,
  startingPriceWindowDays = DEFAULT_SETTINGS.startingPriceWindowDays,
}: FindAllCabinsParams = {}) {
  const where = buildWhereClause(categorySlug, filters);

  if (needsPricingPath(filters)) {
    return findAllCabinsWithPricing({
      where,
      skip,
      limit,
      filters: filters!,
      startingPriceWindowDays,
    });
  }

  const [data, total] = await Promise.all([
    prisma.cabin.findMany({
      where,
      skip,
      take: limit,
      ...cabinInclude,
    }),
    prisma.cabin.count({ where }),
  ]);

  //* مسیر بدون پارامتر قیمت: startingPrice را با یک کوئری گروهی اضافه می‌کنیم.
  const enriched = await enrichWithStartingPrice(data as CabinWithCity[], startingPriceWindowDays);
  return { data: enriched, total };
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

/** همه‌ی amenities یکتا — به‌جای بارگذاری کل کابین‌ها، در دیتابیس unnest می‌کنیم. */
export async function findAllAmenities(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ amenity: string }[]>(
    Prisma.sql`SELECT DISTINCT unnest("amenities") AS amenity FROM "cabins" ORDER BY amenity ASC`,
  );
  return rows.map((row) => row.amenity);
}

export async function findCabinById(id: number, db: Db = prisma): Promise<Cabin | null> {
  return db.cabin.findUnique({ where: { id } });
}

export async function createCabin(data: Prisma.CabinCreateInput, db: Db = prisma): Promise<Cabin> {
  return db.cabin.create({ data });
}

export async function updateCabin(
  id: number,
  data: Prisma.CabinUpdateInput,
  db: Db = prisma,
): Promise<Cabin> {
  return db.cabin.update({ where: { id }, data });
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

/** تعداد کابین‌هایی که `regularPrice`شان خارج از بازه‌ی [min, max] است. */
export async function countCabinsOutsidePriceRange(
  min: number,
  max: number,
  db: Db = prisma,
): Promise<number> {
  return db.cabin.count({
    where: { OR: [{ regularPrice: { lt: min } }, { regularPrice: { gt: max } }] },
  });
}

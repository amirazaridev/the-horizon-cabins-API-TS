import { prisma, PrismaTransactionClient } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Cabin } from "../generated/prisma/client.js";
import { CabinFilters, CabinWithCity, LastMinuteCabin } from "../types/cabin.types.js";
import {
  enrichWithStartingPrice,
  findAllCabinsWithPricing,
  needsPricingPath,
} from "./cabin-search.repository.js";
import { cabinOrderBy } from "../utils/cabin-sort.util.js";
import { addDaysUtc, endOfTehranDayUtc, todayInTimezone } from "../utils/date.util.js";
import { TIMEZONE } from "../constants/booking.constants.js";
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
      //* سورت‌های ستون‌محور (`newest`/`rating_desc`) در همین مسیر اعمال می‌شوند؛
      //* سورت‌های قیمت/تعداد رزرو به مسیر خام می‌روند (needsPricingPath).
      orderBy: cabinOrderBy(filters?.sort),
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

/**
 * پیشنهادهای «تخفیف لحظه‌آخری» برای سکشن لندینگ.
 *
 * منطق انتخاب: قاعده‌ی تخفیف فعال از نوع `dateRange` که **شروعش رسیده**
 * (`startDate <= today`) و **امروز یا فردا منقضی می‌شود**
 * (`endDate ∈ [today, today+1]`). تخفیف‌هایی که از فردا شروع می‌شوند وارد
 * نمی‌شوند (تصمیم پروژه).
 *
 * قیمت هر کارت از read-model `CabinDailyPrice` (نزدیک‌ترین شب تخفیف‌خورده)
 * می‌آید و `expiresAt` لحظه‌ی پایان روزِ `endDate` به وقت تهران است.
 * خروجی بر اساس نزدیک‌ترین انقضا مرتب می‌شود.
 */
export async function findLastMinuteCabins(limit: number): Promise<LastMinuteCabin[]> {
  const today = todayInTimezone(TIMEZONE);
  const tomorrow = addDaysUtc(today, 1);

  //* ۱. قواعد تخفیف فعالی که امروز/فردا منقضی می‌شوند.
  const rules = await prisma.priceRule.findMany({
    where: {
      type: "discount",
      kind: "dateRange",
      isActive: true,
      startDate: { lte: today },
      endDate: { gte: today, lte: tomorrow },
    },
    select: { cabinId: true, startDate: true, endDate: true, percent: true },
    orderBy: [{ endDate: "asc" }, { percent: "desc" }, { cabinId: "asc" }],
  });

  if (rules.length === 0) return [];

  //* ۲. برای هر کابین نزدیک‌ترین قاعده (کوچک‌ترین endDate) را نگه می‌داریم.
  const nearestByCabin = new Map<number, { endDate: Date; percent: number }>();
  for (const rule of rules) {
    if (rule.startDate === null || rule.endDate === null) continue;
    if (!nearestByCabin.has(rule.cabinId)) {
      nearestByCabin.set(rule.cabinId, { endDate: rule.endDate, percent: rule.percent });
    }
  }

  //* ۳. مرتب بر اساس نزدیک‌ترین انقضا و برش به `limit`.
  const selected = [...nearestByCabin.entries()]
    .sort((a, b) => a[1].endDate.getTime() - b[1].endDate.getTime() || a[0] - b[0])
    .slice(0, limit);

  if (selected.length === 0) return [];

  const cabinIds = selected.map(([cabinId]) => cabinId);

  //* ۴. کابین‌ها و قیمت شب‌های تخفیف‌خورده را یک‌جا می‌گیریم (بدون N+1).
  const [cabins, priceRows] = await Promise.all([
    prisma.cabin.findMany({ where: { id: { in: cabinIds } }, ...cabinInclude }),
    prisma.cabinDailyPrice.findMany({
      where: {
        cabinId: { in: cabinIds },
        date: { gte: today, lte: tomorrow },
        discountPercent: { gt: 0 },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const cabinById = new Map((cabins as CabinWithCity[]).map((cabin) => [cabin.id, cabin]));

  //* ترتیب صعودی تاریخ ⇒ اولین ردیف هر کابین «نزدیک‌ترین شب تخفیف‌خورده» است.
  const priceByCabin = new Map<number, { basePrice: number; finalPrice: number; discountPercent: number }>();
  for (const row of priceRows) {
    if (!priceByCabin.has(row.cabinId)) {
      priceByCabin.set(row.cabinId, {
        basePrice: row.basePrice,
        finalPrice: row.finalPrice,
        discountPercent: row.discountPercent,
      });
    }
  }

  const result: LastMinuteCabin[] = [];
  for (const [cabinId, rule] of selected) {
    const cabin = cabinById.get(cabinId);
    if (!cabin) continue;

    const price = priceByCabin.get(cabinId);
    //* اگر تقویم قیمت ساخته نشده باشد، تخفیف درصدی را دستی اعمال می‌کنیم.
    const originalPrice = price?.basePrice ?? cabin.regularPrice;
    const finalPrice =
      price?.finalPrice ?? Math.floor((originalPrice * (100 - rule.percent)) / 100);

    result.push({
      ...cabin,
      originalPrice,
      finalPrice,
      discountPercent: price?.discountPercent ?? rule.percent,
      expiresAt: endOfTehranDayUtc(rule.endDate).toISOString(),
    });
  }

  return result;
}

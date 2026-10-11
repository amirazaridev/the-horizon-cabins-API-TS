import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Region, City } from "../generated/prisma/client.js";
import type {
  CityWithRegion,
  PopularCity,
  RegionWithCitiesCount,
} from "../types/location.types.js";
import { RANKING_STATUS_SQL_LIST } from "../constants/booking.constants.js";

const RANKING_STATUS_SQL = Prisma.raw(RANKING_STATUS_SQL_LIST);

// -------------------------------------
// Regions (read only)
// -------------------------------------

export async function findAllRegions(): Promise<RegionWithCitiesCount[]> {
  return prisma.region.findMany({
    orderBy: { displayOrder: "asc" },
    include: {
      _count: {
        select: { cities: true },
      },
    },
  });
}

export async function findRegionById(id: number): Promise<Region | null> {
  return prisma.region.findUnique({ where: { id } });
}

export async function findRegionCities(regionId: number): Promise<City[]> {
  return prisma.city.findMany({
    where: { regionId },
    orderBy: { id: "asc" },
  });
}

// -------------------------------------
// Cities (CRUD)
// -------------------------------------

export async function findAllCities(): Promise<CityWithRegion[]> {
  return prisma.city.findMany({
    orderBy: { id: "asc" },
    include: {
      region: {
        select: { id: true, name: true, slug: true },
      },
    },
  });
}

export async function findCityById(id: number): Promise<City | null> {
  return prisma.city.findUnique({ where: { id } });
}

export async function createCity(data: Prisma.CityCreateInput): Promise<City> {
  return prisma.city.create({ data });
}

export async function updateCity(id: number, data: Prisma.CityUpdateInput): Promise<City> {
  return prisma.city.update({ where: { id }, data });
}

export async function deleteCity(id: number): Promise<City | null> {
  try {
    return await prisma.city.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

export async function countCabinsForCity(cityId: number): Promise<number> {
  return prisma.cabin.count({ where: { cityId } });
}

// -------------------------------------
// Popular cities (landing)
// -------------------------------------

/** ردیف خام کوئری شهرهای پرطرفدار (نام ستون‌ها با کوتیشن حفظ می‌شوند). */
interface PopularCityRow {
  id: number;
  name: string;
  imageUrl: string | null;
  regionId: number;
  regionRefId: number | null;
  regionRefName: string | null;
  regionRefSlug: string | null;
  cabinsCount: number;
  bookingsCount: number;
}

/**
 * شهرهای پرطرفدار برای سکشن لندینگ.
 *
 * مرتب‌سازی بر اساس بیشترین تعداد رزرو (`confirmed`/`checked_in`/`checked_out`).
 * شهرهای بدون رزرو حذف نمی‌شوند (سورت است، نه فیلتر) و در انتهای لیست می‌آیند.
 * `cabinsCount` برای متن کارت («N اقامتگاه») جداگانه شمرده می‌شود تا JOIN
 * رزروها آن را چند برابر نکند.
 */
export async function findPopularCities(limit: number): Promise<PopularCity[]> {
  const rows = await prisma.$queryRaw<PopularCityRow[]>(Prisma.sql`
    SELECT
      c."id" AS "id",
      c."name" AS "name",
      c."image_url" AS "imageUrl",
      c."region_id" AS "regionId",
      r."id" AS "regionRefId",
      r."name" AS "regionRefName",
      r."slug" AS "regionRefSlug",
      COUNT(DISTINCT cb."id")::int AS "cabinsCount",
      COUNT(b."id")::int AS "bookingsCount"
    FROM "cities" AS c
    LEFT JOIN "regions" AS r ON r."id" = c."region_id"
    LEFT JOIN "cabins" AS cb ON cb."city_id" = c."id"
    LEFT JOIN "bookings" AS b
      ON b."cabin_id" = cb."id" AND b."status" IN (${RANKING_STATUS_SQL})
    GROUP BY c."id", r."id"
    ORDER BY "bookingsCount" DESC, c."id" ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    regionId: row.regionId,
    region:
      row.regionRefId === null
        ? null
        : {
            id: row.regionRefId,
            name: row.regionRefName ?? "",
            slug: row.regionRefSlug ?? "",
          },
    cabinsCount: row.cabinsCount,
    bookingsCount: row.bookingsCount,
  }));
}

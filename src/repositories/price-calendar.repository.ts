import { prisma, PrismaTransactionClient } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { CabinDailyPrice } from "../generated/prisma/client.js";

type Db = typeof prisma | PrismaTransactionClient;

/** حداکثر تعداد ردیف در هر createMany (برای bulk بزرگ). */
const INSERT_CHUNK_SIZE = 5_000;

export interface CabinDailyPriceRow {
  cabinId: number;
  date: Date;
  basePrice: number;
  discountPercent: number;
  surchargePercent: number;
  finalPrice: number;
}

/** ردیف‌های تقویم یک کابین در بازه‌ی [from, to] (شامل). */
export async function findCabinDailyPrices(
  cabinId: number,
  from: Date,
  to: Date,
  db: Db = prisma,
): Promise<CabinDailyPrice[]> {
  return db.cabinDailyPrice.findMany({
    where: { cabinId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
}

export async function deleteCabinDailyPricesInRange(
  cabinId: number,
  from: Date,
  to: Date,
  db: Db = prisma,
): Promise<number> {
  const { count } = await db.cabinDailyPrice.deleteMany({
    where: { cabinId, date: { gte: from, lte: to } },
  });
  return count;
}

/** حذف ردیف‌های تقویمِ گذشته (date < before) برای همه‌ی کابین‌ها. */
export async function deleteCabinDailyPricesBefore(before: Date, db: Db = prisma): Promise<number> {
  const { count } = await db.cabinDailyPrice.deleteMany({ where: { date: { lt: before } } });
  return count;
}

/** درج chunked ردیف‌های تقویم. */
export async function insertCabinDailyPrices(
  rows: CabinDailyPriceRow[],
  db: Db = prisma,
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const result = await db.cabinDailyPrice.createMany({ data: chunk });
    inserted += result.count;
  }
  return inserted;
}

/**
 * شناسه‌ی کابین‌هایی که تقویمشان در بازه‌ی [from, to] کامل نیست
 * (کمتر از `expectedDays` ردیف دارند).
 */
export async function findCabinIdsWithIncompleteCalendar(
  from: Date,
  to: Date,
  expectedDays: number,
  db: Db = prisma,
): Promise<number[]> {
  const rows = await db.$queryRaw<{ id: number }[]>(
    Prisma.sql`
      SELECT c."id"
      FROM "cabins" AS c
      LEFT JOIN "cabin_daily_prices" AS p
        ON p."cabin_id" = c."id" AND p."date" BETWEEN ${from} AND ${to}
      GROUP BY c."id"
      HAVING count(p."date") < ${expectedDays}
      ORDER BY c."id" ASC
    `,
  );
  return rows.map((row) => row.id);
}

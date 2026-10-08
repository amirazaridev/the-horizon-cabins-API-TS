import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import { CabinFilters, CabinSort, CabinWithCity, CabinWithPricing } from "../types/cabin.types.js";
import { OCCUPYING_STATUSES, BOOKING_STATUS_DB, TIMEZONE } from "../constants/booking.constants.js";
import { addDaysUtc, nightsBetween, todayInTimezone } from "../utils/date.util.js";

/**
 * کوئری‌های raw مربوط به قیمت‌گذاری کابین‌ها (لیست/فیلتر/مرتب‌سازی روی
 * `cabin_daily_prices`). این توابع قبلاً داخل `cabin.repository.ts` بودند و
 * عمداً جدا شده‌اند تا repository کابین تنها CRUD خالص را نگه دارد.
 * رفتار و امضاها دقیقاً حفظ شده است.
 */

const OCCUPYING_STATUS_SQL = Prisma.raw(
  OCCUPYING_STATUSES.map((status) => `'${BOOKING_STATUS_DB[status]}'`).join(", "),
);

const cabinInclude = {
  omit: { cityId: true },
  include: { city: { select: { id: true, name: true } } },
} as const;

/** آیا این درخواست به مسیر «قیمت‌محور» (raw SQL) نیاز دارد؟ */
export function needsPricingPath(filters?: CabinFilters): boolean {
  if (!filters) return false;
  return (
    filters.startDate !== undefined ||
    filters.endDate !== undefined ||
    filters.price !== undefined ||
    filters.totalPrice !== undefined ||
    filters.sort !== undefined
  );
}

/**
 * مسیر قیمت‌محور (P6):
 *  ۱. شناسه‌ی کابین‌های واجد شرایط فیلترهای غیرقیمتی (Prisma).
 *  ۲. یک کوئری پارامتری روی CabinDailyPrice برای فیلتر قیمت، موجودی،
 *     مرتب‌سازی، صفحه‌بندی و شمارش کل.
 *  ۳. بارگذاری کابین‌های همان صفحه و بازچینی بر اساس ترتیب SQL.
 */
export async function findAllCabinsWithPricing(params: {
  where: Prisma.CabinWhereInput;
  skip: number;
  limit: number;
  filters: CabinFilters;
  /** پنجره‌ی محاسبه‌ی startingPrice — از تنظیمات مؤثر تزریق می‌شود. */
  startingPriceWindowDays: number;
}): Promise<{ data: CabinWithPricing[]; total: number }> {
  const { where, skip, limit, filters, startingPriceWindowDays } = params;
  const now = new Date();
  const today = todayInTimezone(TIMEZONE, now);
  const stayMode = filters.startDate !== undefined && filters.endDate !== undefined;

  const candidateCabins = await prisma.cabin.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const candidateIds = candidateCabins.map((cabin) => cabin.id);

  if (candidateIds.length === 0) return { data: [], total: 0 };

  //* ترتیب نهایی: پیش‌فرض id ASC؛ در حالت sort=price_* بر اساس قیمت.
  const sort: CabinSort | undefined = filters.sort;
  const orderByPrice =
    sort === "price_asc"
      ? Prisma.sql`ORDER BY "sortPrice" ASC NULLS LAST, c."id" ASC`
      : sort === "price_desc"
        ? Prisma.sql`ORDER BY "sortPrice" DESC NULLS LAST, c."id" ASC`
        : Prisma.sql`ORDER BY c."id" ASC`;

  const result = stayMode
    ? await queryStayPricing({ candidateIds, filters, now, skip, limit, orderByPrice })
    : await queryStartingPrice({
        candidateIds,
        filters,
        today,
        skip,
        limit,
        orderByPrice,
        startingPriceWindowDays,
      });

  if (result.rows.length === 0) return { data: [], total: result.total };

  const pageIds = result.rows.map((row) => row.id);
  const cabins = (await prisma.cabin.findMany({
    where: { id: { in: pageIds } },
    ...cabinInclude,
  })) as CabinWithCity[];

  const cabinById = new Map(cabins.map((cabin) => [cabin.id, cabin]));

  const data: CabinWithPricing[] = [];
  for (const row of result.rows) {
    const cabin = cabinById.get(row.id);
    if (!cabin) continue;

    if (stayMode) {
      data.push({
        ...cabin,
        pricing: {
          mode: "stay",
          nights: row.nights ?? 0,
          totalPrice: row.sortPrice ?? 0,
          avgNightlyPrice: Math.floor((row.sortPrice ?? 0) / (row.nights || 1)),
        },
      });
    } else {
      data.push({
        ...cabin,
        pricing: {
          mode: "startingFrom",
          startingPrice: row.sortPrice,
          windowDays: startingPriceWindowDays,
        },
      });
    }
  }

  return { data, total: result.total };
}

interface PricingRow {
  id: number;
  sortPrice: number | null;
  nights: number | null;
}

/** حالت اقامت (با تاریخ): totalPrice = SUM(finalPrice) روی شب‌های اقامت. */
async function queryStayPricing(params: {
  candidateIds: number[];
  filters: CabinFilters;
  now: Date;
  skip: number;
  limit: number;
  orderByPrice: Prisma.Sql;
}): Promise<{ rows: PricingRow[]; total: number }> {
  const { candidateIds, filters, now, skip, limit, orderByPrice } = params;
  const startDate = filters.startDate!;
  const endDate = filters.endDate!;
  const nights = nightsBetween(startDate, endDate);
  const lastNight = addDaysUtc(endDate, -1);

  //* فیلتر قیمت شبانه‌ی میانگین: total >= min*nights AND total <= max*nights
  const priceFilter = filters.price
    ? Prisma.sql`AND "sortPrice" >= ${filters.price.min * nights} AND "sortPrice" <= ${filters.price.max * nights}`
    : Prisma.empty;

  const totalFilter = filters.totalPrice
    ? Prisma.sql`AND "sortPrice" >= ${filters.totalPrice.min} AND "sortPrice" <= ${filters.totalPrice.max}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<(PricingRow & { totalCount: bigint })[]>(Prisma.sql`
    WITH stay AS (
      SELECT
        p."cabin_id" AS id,
        SUM(p."final_price")::int AS "sortPrice",
        COUNT(*)::int AS nights
      FROM "cabin_daily_prices" AS p
      WHERE p."cabin_id" = ANY(${candidateIds})
        AND p."date" >= ${startDate}::date
        AND p."date" <= ${lastNight}::date
      GROUP BY p."cabin_id"
      HAVING COUNT(*) = ${nights}
    )
    SELECT s.id, s."sortPrice", s.nights, COUNT(*) OVER() AS "totalCount"
    FROM stay AS s
    JOIN "cabins" AS c ON c."id" = s.id
    WHERE NOT EXISTS (
        SELECT 1 FROM "bookings" AS b
        WHERE b."cabin_id" = c."id"
          AND (
            b."status" IN (${OCCUPYING_STATUS_SQL})
            OR (b."status" = 'pending' AND b."payment_deadline" > ${now})
          )
          AND b."start_date" < ${endDate}::date
          AND b."end_date" > ${startDate}::date
      )
      ${priceFilter}
      ${totalFilter}
    ${orderByPrice}
    LIMIT ${limit} OFFSET ${skip}
  `);

  const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
  return { rows, total };
}

/** حالت startingFrom (بدون تاریخ): startingPrice = MIN(finalPrice) در پنجره. */
async function queryStartingPrice(params: {
  candidateIds: number[];
  filters: CabinFilters;
  today: Date;
  skip: number;
  limit: number;
  orderByPrice: Prisma.Sql;
  startingPriceWindowDays: number;
}): Promise<{ rows: PricingRow[]; total: number }> {
  const { candidateIds, filters, today, skip, limit, orderByPrice, startingPriceWindowDays } =
    params;
  const windowEnd = addDaysUtc(today, startingPriceWindowDays - 1);

  //* فیلتر قیمت بدون تاریخ روی startingPrice.
  const priceFilter = filters.price
    ? Prisma.sql`AND "sortPrice" >= ${filters.price.min} AND "sortPrice" <= ${filters.price.max}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<(PricingRow & { totalCount: bigint })[]>(Prisma.sql`
    WITH starting AS (
      SELECT
        p."cabin_id" AS id,
        MIN(p."final_price")::int AS "sortPrice"
      FROM "cabin_daily_prices" AS p
      WHERE p."cabin_id" = ANY(${candidateIds})
        AND p."date" >= ${today}::date
        AND p."date" <= ${windowEnd}::date
      GROUP BY p."cabin_id"
    )
    SELECT c."id" AS id, s."sortPrice", NULL::int AS nights, COUNT(*) OVER() AS "totalCount"
    FROM "cabins" AS c
    LEFT JOIN starting AS s ON s.id = c."id"
    WHERE c."id" = ANY(${candidateIds})
      ${priceFilter}
    ${orderByPrice}
    LIMIT ${limit} OFFSET ${skip}
  `);

  const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
  return { rows, total };
}

/**
 * افزودن startingPrice به مسیر بدون پارامتر (سازگاری با خروجی جدید).
 * کابین‌های بدون ردیف تقویم → null.
 */
export async function enrichWithStartingPrice(
  cabins: CabinWithCity[],
  startingPriceWindowDays: number,
): Promise<CabinWithPricing[]> {
  if (cabins.length === 0) return [];

  const today = todayInTimezone(TIMEZONE);
  const windowEnd = addDaysUtc(today, startingPriceWindowDays - 1);
  const ids = cabins.map((cabin) => cabin.id);

  const rows = await prisma.$queryRaw<{ id: number; startingPrice: number | null }[]>(Prisma.sql`
    SELECT c."id" AS id, MIN(p."final_price")::int AS "startingPrice"
    FROM "cabins" AS c
    LEFT JOIN "cabin_daily_prices" AS p
      ON p."cabin_id" = c."id" AND p."date" >= ${today}::date AND p."date" <= ${windowEnd}::date
    WHERE c."id" = ANY(${ids})
    GROUP BY c."id"
  `);

  const priceById = new Map(rows.map((row) => [row.id, row.startingPrice]));

  return cabins.map((cabin) => ({
    ...cabin,
    pricing: {
      mode: "startingFrom" as const,
      startingPrice: priceById.get(cabin.id) ?? null,
      windowDays: startingPriceWindowDays,
    },
  }));
}

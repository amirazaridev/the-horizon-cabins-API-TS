import { Prisma } from "../generated/prisma/client.js";
import type { CabinSort } from "../types/cabin.types.js";

/**
 * فیچر عمومی مرتب‌سازی کابین‌ها.
 *
 * این ماژول تنها منبع حقیقت برای مقادیر مجاز `sort` و تبدیل آن‌ها به
 * ترتیب‌های واقعی (هم `orderBy` پریزما و هم `ORDER BY` خام SQL) است تا
 * اندپوینت‌های مختلف (لیست کابین‌ها، منتخب، اقتصادی و …) رفتار یکسان داشته باشند.
 *
 * سه دسته‌ی سورت داریم:
 *  ۱. قیمت‌محور (`price_asc`/`price_desc`) → مسیر خام SQL روی `cabin_daily_prices`.
 *  ۲. شمارش رزرو (`most_booked`) → مسیر خام SQL + زیرکوئری تجمیعی رزرو.
 *  ۳. ستون‌محور (`newest`/`rating_desc`) → مسیر عادی پریزما.
 */

/** همه‌ی مقادیر مجاز `sort` — تنها منبع حقیقت (در اعتبارسنجی هم استفاده می‌شود). */
export const CABIN_SORT_VALUES = [
  "price_asc",
  "price_desc",
  "newest",
  "most_booked",
  "rating_desc",
] as const satisfies readonly CabinSort[];

/** سورت بر پایه‌ی قیمت (ارزان‌ترین/گران‌ترین) — روی `final_price`. */
export function isPriceBasedSort(sort?: CabinSort): boolean {
  return sort === "price_asc" || sort === "price_desc";
}

/** سورت بر پایه‌ی تعداد رزرو — نیازمند تجمیع روی جدول رزروها. */
export function isBookingCountSort(sort?: CabinSort): boolean {
  return sort === "most_booked";
}

/**
 * آیا این سورت به مسیر خام SQL نیاز دارد؟
 *
 * `newest` و `rating_desc` روی ستون‌های خود کابین‌اند و با پریزما کافی‌اند؛
 * بقیه (قیمت و تعداد رزرو) باید از مسیر خام عبور کنند.
 */
export function needsRawSortPath(sort?: CabinSort): boolean {
  return isPriceBasedSort(sort) || isBookingCountSort(sort);
}

/**
 * ترتیب پریزما برای سورت‌های ستون‌محور (مسیر عادی).
 *
 * برای سورت‌های قیمتی/تعدادرزرو این تابع صدا زده نمی‌شود (مسیر خام).
 * همیشه یک `id` به‌عنوان tie-breaker می‌آید تا نتیجه پایدار بماند.
 */
export function cabinOrderBy(sort?: CabinSort): Prisma.CabinOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }, { id: "desc" }];
    case "rating_desc":
      return [{ rating: "desc" }, { id: "asc" }];
    default:
      return [{ id: "asc" }];
  }
}

/**
 * قطعه‌ی `ORDER BY` برای مسیر خام SQL.
 *
 * ⚠️ به ستون‌های `sortPrice` (از CTE قیمت) و `bookingCount` (از JOIN رزروها)
 * وابسته است؛ مسیر خام موظف است این ستون‌ها را در SELECT فراهم کند.
 */
export function cabinOrderBySql(sort?: CabinSort): Prisma.Sql {
  switch (sort) {
    case "price_asc":
      return Prisma.sql`ORDER BY "sortPrice" ASC NULLS LAST, c."id" ASC`;
    case "price_desc":
      return Prisma.sql`ORDER BY "sortPrice" DESC NULLS LAST, c."id" ASC`;
    case "most_booked":
      return Prisma.sql`ORDER BY "bookingCount" DESC NULLS LAST, c."id" ASC`;
    case "newest":
      return Prisma.sql`ORDER BY c."created_at" DESC, c."id" DESC`;
    case "rating_desc":
      return Prisma.sql`ORDER BY c."rating" DESC, c."id" ASC`;
    default:
      return Prisma.sql`ORDER BY c."id" ASC`;
  }
}

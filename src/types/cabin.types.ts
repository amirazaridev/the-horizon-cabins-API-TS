import { Prisma } from "../generated/prisma/client.js";

export type CabinWithCity = Prisma.CabinGetPayload<{
  omit: { cityId: true };
  include: { city: { select: { id: true; name: true } } };
}>;

export interface PriceRange {
  min: number;
  max: number;
}

/**
 * مقادیر مجاز مرتب‌سازی لیست کابین‌ها.
 *
 *  - `price_asc` / `price_desc` → بر پایه‌ی قیمت مؤثر (پس از تخفیف/افزایش).
 *  - `newest`                   → جدیدترین کابین ثبت‌شده (`createdAt` نزولی).
 *  - `most_booked`              → بیشترین تعداد رزرو.
 *  - `rating_desc`              → بیشترین امتیاز.
 */
export type CabinSort = "price_asc" | "price_desc" | "newest" | "most_booked" | "rating_desc";

export interface CabinFilters {
  guests?: number;
  bedrooms?: number;
  amenities?: string[];
  /** فیلتر قیمت شبانه؛ بدون تاریخ روی startingPrice و با تاریخ روی میانگین شب. */
  price?: PriceRange;
  /** فیلتر جمع کل؛ فقط همراه با تاریخ‌ها. */
  totalPrice?: PriceRange;
  cityId?: number;
  regionId?: number;
  startDate?: Date;
  endDate?: Date;
  sort?: CabinSort;
}

/** شیء pricing هر کابین در پاسخ لیست. */
export type CabinPricing =
  | { mode: "stay"; nights: number; totalPrice: number; avgNightlyPrice: number }
  | { mode: "startingFrom"; startingPrice: number | null; windowDays: number };

/** کابین + شیء pricing در پاسخ لیست. */
export type CabinWithPricing = CabinWithCity & { pricing: CabinPricing };

/**
 * یک پیشنهاد «تخفیف لحظه‌آخری» — کابینی که قاعده‌ی تخفیف فعالش امروز یا فردا
 * منقضی می‌شود.
 */
export type LastMinuteCabin = CabinWithCity & {
  /** قیمت نهایی شب تخفیف‌خورده (پس از تخفیف). */
  finalPrice: number;
  /** قیمت پیش از تخفیف (خط‌خورده در کارت). */
  originalPrice: number;
  /** درصد تخفیف اعمال‌شده روی آن شب. */
  discountPercent: number;
  /** لحظه‌ی انقضای تخفیف (ISO) — مبنای تایمر سمت کلاینت. */
  expiresAt: string;
};

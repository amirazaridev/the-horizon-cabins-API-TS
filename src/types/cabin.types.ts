import { Prisma } from "../generated/prisma/client.js";

export type CabinWithCity = Prisma.CabinGetPayload<{
  omit: { cityId: true };
  include: { city: { select: { id: true; name: true } } };
}>;

export interface PriceRange {
  min: number;
  max: number;
}

export type CabinSort = "price_asc" | "price_desc";

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

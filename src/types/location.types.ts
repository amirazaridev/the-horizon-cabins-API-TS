import { Prisma } from "../generated/prisma/client.js";

export type RegionWithCitiesCount = Prisma.RegionGetPayload<{
  include: { _count: { select: { cities: true } } };
}>;

export type CityWithRegion = Prisma.CityGetPayload<{
  include: { region: { select: { id: true; name: true; slug: true } } };
}>;

/**
 * شهر پرطرفدار برای سکشن «مقاصد محبوب» صفحه‌ی لندینگ.
 *
 * ترتیب خروجی بر اساس `bookingsCount` نزولی است، ولی برای نمایش کارت
 * «N اقامتگاه» از `cabinsCount` استفاده می‌شود.
 */
export type PopularCity = {
  id: number;
  name: string;
  imageUrl: string | null;
  regionId: number;
  region: { id: number; name: string; slug: string } | null;
  /** تعداد اقامتگاه‌های شهر (برای متن کارت). */
  cabinsCount: number;
  /** تعداد رزروهای واقعی‌شده (مبنای مرتب‌سازی). */
  bookingsCount: number;
};

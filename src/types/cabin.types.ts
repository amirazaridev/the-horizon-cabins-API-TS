import { Prisma } from "../generated/prisma/client.js";

export type CabinWithCity = Prisma.CabinGetPayload<{
  omit: { cityId: true };
  include: { city: { select: { id: true; name: true } } };
}>;

export interface PriceRange {
  min: number;
  max: number;
}

export interface CabinFilters {
  guests?: number;
  bedrooms?: number;
  amenities?: string[];
  price?: PriceRange;
  cityId?: number;
}
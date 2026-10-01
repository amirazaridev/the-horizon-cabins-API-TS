import { Prisma } from "../generated/prisma/client.js";

export type RegionWithCitiesCount = Prisma.RegionGetPayload<{
  include: { _count: { select: { cities: true } } };
}>;

export type CityWithRegion = Prisma.CityGetPayload<{
  include: { region: { select: { id: true; name: true; slug: true } } };
}>;

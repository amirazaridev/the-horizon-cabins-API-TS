import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Region, City } from "../generated/prisma/client.js";
import type { CityWithRegion, RegionWithCitiesCount } from "../types/location.types.js";

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

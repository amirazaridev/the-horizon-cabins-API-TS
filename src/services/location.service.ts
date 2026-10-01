import { AppError } from "../utils/AppError.js";
import * as locationRepository from "../repositories/location.repository.js";
import type { City } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { createCitySchema, updateCitySchema } from "../validations/location.validation.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { Prisma } from "../generated/prisma/client.js";
import type { CityWithRegion, RegionWithCitiesCount } from "../types/location.types.js";

type CreateCityInput = z.infer<typeof createCitySchema.body>;
type UpdateCityInput = z.infer<typeof updateCitySchema.body>;

export interface RegionResponse {
  id: number;
  name: string;
  slug: string;
  displayOrder: number;
  citiesCount: number;
}

function toRegionResponse(region: RegionWithCitiesCount): RegionResponse {
  return {
    id: region.id,
    name: region.name,
    slug: region.slug,
    displayOrder: region.displayOrder,
    citiesCount: region._count.cities,
  };
}

// -------------------------------------
// Regions
// -------------------------------------

export async function getAllRegions(): Promise<RegionResponse[]> {
  const regions = await locationRepository.findAllRegions();
  return regions.map(toRegionResponse);
}

export async function getRegionCities(regionId: number): Promise<City[]> {
  const region = await locationRepository.findRegionById(regionId);
  if (!region) {
    throw new AppError("Region not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
  return locationRepository.findRegionCities(regionId);
}

// -------------------------------------
// Cities
// -------------------------------------

export async function getAllCities(): Promise<CityWithRegion[]> {
  return locationRepository.findAllCities();
}

export async function createCity(input: CreateCityInput): Promise<City> {
  const region = await locationRepository.findRegionById(input.regionId);
  if (!region) {
    throw new AppError("Region not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  try {
    return await locationRepository.createCity({
      name: input.name,
      region: { connect: { id: input.regionId } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(
        "A city with this name already exists",
        HTTP_STATUS.CONFLICT,
        ErrorCode.DUPLICATE_ENTRY,
      );
    }
    throw error;
  }
}

export async function updateCity(id: number, input: UpdateCityInput): Promise<City> {
  const city = await locationRepository.findCityById(id);
  if (!city) {
    throw new AppError("City not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  if (input.regionId !== undefined) {
    const region = await locationRepository.findRegionById(input.regionId);
    if (!region) {
      throw new AppError("Region not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
    }
  }

  try {
    return await locationRepository.updateCity(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.regionId !== undefined && { region: { connect: { id: input.regionId } } }),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        throw new AppError("City not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
      }
      if (error.code === "P2002") {
        throw new AppError(
          "A city with this name already exists",
          HTTP_STATUS.CONFLICT,
          ErrorCode.DUPLICATE_ENTRY,
        );
      }
    }
    throw error;
  }
}

export async function deleteCity(id: number): Promise<void> {
  const cabinCount = await locationRepository.countCabinsForCity(id);
  if (cabinCount > 0) {
    throw new AppError(
      `This city is linked to ${cabinCount} cabin(s) and cannot be deleted`,
      HTTP_STATUS.CONFLICT,
      ErrorCode.RELATION_VIOLATION,
    );
  }

  const deleted = await locationRepository.deleteCity(id);
  if (!deleted) {
    throw new AppError("City not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

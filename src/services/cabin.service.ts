import { AppError } from "../utils/AppError.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import * as categoryRepository from "../repositories/category.repository.js";
import type { Cabin, Category } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { createCabinSchema, updateCabinSchema } from "../validations/cabin.validation.js";
import { extractFilePath, removeUploadedImages, uploadCabinImages } from "../utils/upload.utils.js";
import { getPaginationMeta } from "../utils/pagination.utils.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import type { PaginatedResult } from "../types/pagination.types.js";
import { CabinFilters, CabinWithPricing } from "../types/cabin.types.js";
import { prisma } from "../config/database.js";
import { rebuildCabinPriceCalendar } from "./price-calendar.service.js";

type CreateCabinInput = z.infer<typeof createCabinSchema.body>;
type UpdateCabinInput = z.infer<typeof updateCabinSchema.body>;

type GetAllCabinsParams = {
  skip?: number;
  limit?: number;
  page?: number;
  categorySlug?: string;
  filters?: CabinFilters;
};

export async function getAllCabins(
  params: GetAllCabinsParams = {},
): Promise<PaginatedResult<CabinWithPricing>> {
  const { skip = 0, limit = 10, page = 1, categorySlug, filters } = params;
  const { data, total } = await cabinRepository.findAllCabins({
    skip,
    limit,
    categorySlug,
    filters,
  });
  return {
    data,
    meta: getPaginationMeta(total, page, limit),
  };
}

export async function getAllAmenities(): Promise<string[]> {
  return await cabinRepository.findAllAmenities();
}

export async function getCabinById(id: number): Promise<Cabin> {
  const cabin = await cabinRepository.findCabinById(id);
  if (!cabin) throw new AppError("Cabin not found!", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  return cabin;
}

export async function getCabinCategories(cabinId: number): Promise<Category[]> {
  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) throw new AppError("Cabin not found!", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  const cabinCategories = await cabinRepository.findCabinCategories(cabinId);
  return cabinCategories.map((cc) => cc.category);
}

export async function setCabinCategories(cabinId: number, categoryIds: number[]): Promise<void> {
  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) throw new AppError("Cabin not found!", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  const uniqueIds = [...new Set(categoryIds)];
  const existingCategories = await categoryRepository.findCategoriesByIds(uniqueIds);
  if (existingCategories.length !== uniqueIds.length) {
    throw new AppError(
      "One or more categories are invalid",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  await cabinRepository.setCategoriesForCabin(cabinId, uniqueIds);
}

export async function removeCabinCategory(cabinId: number, categoryId: number): Promise<void> {
  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) throw new AppError("Cabin not found!", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  const category = await categoryRepository.findCategoryById(categoryId);
  if (!category)
    throw new AppError("Category not found!", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  await cabinRepository.removeCabinCategory(cabinId, categoryId);
}

export async function createCabin(
  input: CreateCabinInput,
  imageFiles: Express.Multer.File[] = [],
): Promise<Cabin> {
  const { cityId, ...cabinData } = input;

  const uploadedUrls = await uploadCabinImages(imageFiles);

  if (uploadedUrls.length === 0) {
    throw new AppError(
      "At least one image is required",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  try {
    const cabinCreated = await prisma.$transaction(async (tx) => {
      const cabin = await cabinRepository.createCabin(
        {
          ...cabinData,
          images: uploadedUrls,
          city: { connect: { id: cityId } },
        },
        tx,
      );
      await rebuildCabinPriceCalendar(tx, cabin.id);
      return cabin;
    });
    return cabinCreated;
  } catch (error) {
    await removeUploadedImages(uploadedUrls.map(extractFilePath));
    throw error;
  }
}

export async function updateCabin(
  id: number,
  input: UpdateCabinInput,
  imageFiles: Express.Multer.File[] = [],
): Promise<Cabin> {
  const existingCabin = await cabinRepository.findCabinById(id);
  if (!existingCabin)
    throw new AppError(`Cabin with id ${id} not found`, HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  const uploadedUrls = await uploadCabinImages(imageFiles);
  const finalImages = [...(input.keepExistingImages ?? []), ...uploadedUrls];

  if (finalImages.length === 0) {
    await removeUploadedImages(uploadedUrls.map(extractFilePath));
    throw new AppError(
      "At least one image is required",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const cabin = input;
  const priceChanged =
    cabin.regularPrice !== undefined && cabin.regularPrice !== existingCabin.regularPrice;

  try {
    const updatedCabin = await prisma.$transaction(async (tx) => {
      const cabinUpd = await cabinRepository.updateCabin(id, { ...cabin, images: finalImages }, tx);
      if (priceChanged) await rebuildCabinPriceCalendar(tx, id);
      return cabinUpd;
    });

    const removedImages = (existingCabin.images ?? []).filter(
      (oldUrl) => !finalImages.includes(oldUrl),
    );
    if (removedImages.length > 0) {
      await removeUploadedImages(removedImages.map(extractFilePath));
    }

    return updatedCabin;
  } catch (error) {
    await removeUploadedImages(uploadedUrls.map(extractFilePath));
    throw error;
  }
}

export async function deleteCabin(id: number): Promise<void> {
  const deletedCabin = await cabinRepository.deleteCabin(id);
  if (!deletedCabin)
    throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  await removeUploadedImages((deletedCabin.images ?? []).map(extractFilePath));
}

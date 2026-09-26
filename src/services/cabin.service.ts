import { AppError } from "../utils/AppError.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import type { Cabin, City } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { createCabinSchema, updateCabinSchema } from "../validations/cabin.validation.js";
import { extractFilePath, removeUploadedImages, uploadCabinImages } from "../utils/upload.utils.js";
import { getPaginationMeta } from "../utils/pagination.utils.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { PaginatedResult, PaginationParams } from "../types/pagination.types.js";
import { CabinWithCity } from "../types/cabin.types.js";

type CreateCabinInput = z.infer<typeof createCabinSchema.body>;
type UpdateCabinInput = z.infer<typeof updateCabinSchema.body>;

export async function getAllCabins({
  skip = 0,
  limit = 10,
  page = 1,
}: PaginationParams): Promise<PaginatedResult<CabinWithCity>> {
  const { data, total } = await cabinRepository.findAllCabins({ skip, limit });
  return {
    data,
    meta: getPaginationMeta(total, page, limit),
  };
}
export async function getAllCities(): Promise<City[]> {
  return await cabinRepository.findAllCities();
}

export async function getCabinById(id: number): Promise<Cabin> {
  const cabin = await cabinRepository.findCabinById(id);
  if (!cabin) throw new AppError("Cabin not found!", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  return cabin;
}

export async function createCabin(
  input: CreateCabinInput,
  imageFiles: Express.Multer.File[] = [],
): Promise<Cabin> {
  const { cityId, keepExistingImages, ...cabinData } = input;

  const uploadedUrls = await uploadCabinImages(imageFiles);

  if (uploadedUrls.length === 0) {
    throw new AppError(
      "At least one image is required",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  try {
    return await cabinRepository.createCabin({
      ...cabinData,
      images: uploadedUrls,
      city: { connect: { id: cityId } },
    });
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

  const finalPrice = input.regularPrice ?? Number(existingCabin.regularPrice);
  const finalDiscount = input.discount ?? existingCabin.discount;
  if (finalDiscount > finalPrice) {
    throw new AppError(
      "The discount cannot exceed the original price.",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
    );
  }

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

  const { cityId, keepExistingImages, ...rest } = input;

  try {
    const updatedCabin = await cabinRepository.updateCabin(id, {
      ...rest,
      images: finalImages,
      ...(cityId !== undefined && { city: { connect: { id: cityId } } }),
    });

    // 🧹 عکس‌های قدیمی که کاربر حذف کرده → از storage هم پاک کن
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

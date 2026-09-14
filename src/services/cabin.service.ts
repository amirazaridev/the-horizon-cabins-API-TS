import { AppError } from "../utils/AppError.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import type { Cabin, City } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { createCabinSchema, updateCabinSchema } from "../validations/cabin.validation.js";
import { extractFilePath, removeUploadedImages, uploadCabinImages } from "../utils/upload.utils.js";

type CreateCabinInput = z.infer<typeof createCabinSchema.body>;
type UpdateCabinInput = z.infer<typeof updateCabinSchema.body>;

export async function getAllCabins() {
  return await cabinRepository.findAllCabins();
}
export async function getAllCities(): Promise<City[]> {
  return await cabinRepository.findAllCities();
}

export async function getCabinById(id: number): Promise<Cabin> {
  const cabin = await cabinRepository.findCabinById(id);
  if (!cabin) throw new AppError("Cabin not found!", 404);
  return cabin;
}

export async function createCabin(
  input: CreateCabinInput,
  imageFiles: Express.Multer.File[] = [],
): Promise<Cabin> {
  const { cityId, keepExistingImages, ...cabinData } = input;

  // ۱. آپلود
  const uploadedUrls = await uploadCabinImages(imageFiles);

  if (uploadedUrls.length === 0) {
    throw new AppError("At least one image is required", 400);
  }

  // ۲. اگر ذخیره در DB شکست خورد، عکس‌های آپلودشده را حذف کن (rollback)
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
  if (!existingCabin) throw new AppError(`Cabin with id ${id} not found`, 404);

  const finalPrice = input.regularPrice ?? Number(existingCabin.regularPrice);
  const finalDiscount = input.discount ?? existingCabin.discount;
  if (finalDiscount > finalPrice) {
    throw new AppError("The discount cannot exceed the original price.", 400);
  }

  const uploadedUrls = await uploadCabinImages(imageFiles);
  const finalImages = [...(input.keepExistingImages ?? []), ...uploadedUrls];

  if (finalImages.length === 0) {
    await removeUploadedImages(uploadedUrls.map(extractFilePath));
    throw new AppError("At least one image is required", 400);
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
  if (!deletedCabin) throw new AppError("Cabin not found", 404);
}

import { AppError } from "../utils/AppError.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import type { Cabin, Prisma } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { createCabinSchema, updateCabinSchema } from "../validations/cabin.validation.js";

type CreateCabinInput = z.infer<typeof createCabinSchema.body>;
type UpdateCabinInput = z.infer<typeof updateCabinSchema.body>;

export async function getAllCabins(): Promise<Cabin[]> {
  return await cabinRepository.findAllCabins();
}

export async function getCabinById(id: number): Promise<Cabin> {
  const cabin = await cabinRepository.findCabinById(id);
  if (!cabin) throw new AppError("Cabin not found!", 404);
  return cabin;
}

export async function createCabin(input: CreateCabinInput): Promise<Cabin> {
  const data: Prisma.CabinCreateInput = {
    ...input,
    regularPrice: BigInt(input.regularPrice),
  };
  return await cabinRepository.createCabin(data);
}

export async function updateCabin(id: number, input: UpdateCabinInput): Promise<Cabin> {
  const existingCabin = await cabinRepository.findCabinById(id);
  if (!existingCabin) throw new AppError(`Cabin with id ${id} not found`, 404);

  const finalPrice = input.regularPrice ?? Number(existingCabin.regularPrice);
  const finalDiscount = input.discount ?? existingCabin.discount;

  if (finalDiscount > finalPrice) {
    throw new AppError("The discount cannot exceed the original price.", 400);
  }

  const data: Prisma.CabinUpdateInput = {
    ...input,
    ...(input.regularPrice !== undefined && { regularPrice: BigInt(input.regularPrice) }),
  };

  return await cabinRepository.updateCabin(id, data);
}

export async function deleteCabin(id: number): Promise<void> {
  const deletedCabin = await cabinRepository.deleteCabin(id);
  if (!deletedCabin) throw new AppError("Cabin not found", 404);
}

import { AppError } from "../utils/AppError.js";
import * as categoryRepository from "../repositories/category.repository.js";
import type { Category } from "../generated/prisma/client.js";
import type { z } from "zod";
import type {
  createCategorySchema,
  updateCategorySchema,
} from "../validations/category.validation.js";
import { formatCabinCount } from "../utils/format.util.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { Prisma } from "../generated/prisma/client.js";

type CreateCategoryInput = z.infer<typeof createCategorySchema.body>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema.body>;

type CategoryResponse = Omit<Category, never> & { meta: string };

function toResponse(category: Category & { _count?: { cabins: number } }): CategoryResponse {
  const { _count, ...rest } = category;
  return {
    ...rest,
    meta: formatCabinCount(_count?.cabins ?? 0),
  };
}

export async function getAllCategories(): Promise<CategoryResponse[]> {
  const categories = await categoryRepository.findAllCategories();
  return categories.map(toResponse);
}

export async function getCategoryById(id: number): Promise<Category> {
  const category = await categoryRepository.findCategoryById(id);
  if (!category)
    throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  return category;
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  try {
    return await categoryRepository.createCategory({
      title: input.title,
      slug: input.slug,
      icon: input.icon,
      displayOrder: input.displayOrder,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined)?.join(", ");
      if (target?.includes("title")) {
        throw new AppError(
          "A category with this title already exists",
          HTTP_STATUS.CONFLICT,
          ErrorCode.DUPLICATE_ENTRY,
        );
      }
      if (target?.includes("slug")) {
        throw new AppError(
          "A category with this slug already exists",
          HTTP_STATUS.CONFLICT,
          ErrorCode.DUPLICATE_ENTRY,
        );
      }
      throw new AppError(
        "Duplicate value entered",
        HTTP_STATUS.CONFLICT,
        ErrorCode.DUPLICATE_ENTRY,
      );
    }
    throw error;
  }
}

export async function updateCategory(id: number, input: UpdateCategoryInput): Promise<Category> {
  try {
    return await categoryRepository.updateCategory(id, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
      }
      if (error.code === "P2002") {
        const target = (error.meta?.target as string[] | undefined)?.join(", ");
        if (target?.includes("title")) {
          throw new AppError(
            "A category with this title already exists",
            HTTP_STATUS.CONFLICT,
            ErrorCode.DUPLICATE_ENTRY,
          );
        }
        if (target?.includes("slug")) {
          throw new AppError(
            "A category with this slug already exists",
            HTTP_STATUS.CONFLICT,
            ErrorCode.DUPLICATE_ENTRY,
          );
        }
        throw new AppError(
          "Duplicate value entered",
          HTTP_STATUS.CONFLICT,
          ErrorCode.DUPLICATE_ENTRY,
        );
      }
    }
    throw error;
  }
}

export async function deleteCategory(id: number): Promise<void> {
  const cabinCount = await categoryRepository.countCabinsForCategory(id);
  if (cabinCount > 0) {
    throw new AppError(
      `This category is linked to ${cabinCount} cabin(s) and cannot be deleted`,
      HTTP_STATUS.CONFLICT,
      ErrorCode.RELATION_VIOLATION,
    );
  }

  const deleted = await categoryRepository.deleteCategory(id);
  if (!deleted) {
    throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

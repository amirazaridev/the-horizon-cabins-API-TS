import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Category, CabinCategory } from "../generated/prisma/client.js";
import type { CategoryWithCount } from "../types/category.types.js";

export async function findAllCategories(): Promise<CategoryWithCount[]> {
  return prisma.category.findMany({
    orderBy: { displayOrder: "asc" },
    include: {
      _count: {
        select: { cabins: true },
      },
    },
  });
}

export async function findCategoryById(id: number): Promise<Category | null> {
  return prisma.category.findUnique({ where: { id } });
}

export async function findCategoriesByIds(ids: number[]): Promise<Category[]> {
  return prisma.category.findMany({ where: { id: { in: ids } } });
}

export async function findCategoryBySlug(slug: string): Promise<Category | null> {
  return prisma.category.findUnique({ where: { slug } });
}

export async function createCategory(data: Prisma.CategoryCreateInput): Promise<Category> {
  return prisma.category.create({ data });
}

export async function updateCategory(
  id: number,
  data: Prisma.CategoryUpdateInput,
): Promise<Category> {
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id: number): Promise<Category | null> {
  try {
    return await prisma.category.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

export async function countCabinsForCategory(categoryId: number): Promise<number> {
  return prisma.cabinCategory.count({ where: { categoryId } });
}

export async function findCabinCategories(cabinId: number): Promise<CabinCategory[]> {
  return prisma.cabinCategory.findMany({
    where: { cabinId },
    include: { category: true },
  });
}

export async function removeCabinCategory(cabinId: number, categoryId: number): Promise<void> {
  await prisma.cabinCategory.delete({
    where: { cabinId_categoryId: { cabinId, categoryId } },
  });
}

export async function setCategoriesForCabin(cabinId: number, categoryIds: number[]): Promise<void> {
  await prisma.$transaction([
    prisma.cabinCategory.deleteMany({ where: { cabinId } }),
    prisma.cabinCategory.createMany({
      data: categoryIds.map((categoryId) => ({ cabinId, categoryId })),
    }),
  ]);
}

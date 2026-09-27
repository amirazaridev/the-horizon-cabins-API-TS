import { PaginationInput, PaginationMeta, PaginationParams } from "../types/pagination.types.js";

export function getPagination(
  query: PaginationInput,
  defaultLimit = 10,
  maxLimit = 100,
): PaginationParams {
  const page = Math.max(Number(query.page) || 1, 1);
  let limit = Number(query.limit) || defaultLimit;
  limit = Math.min(Math.max(limit, 1), maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function getPaginationMeta(totalItems: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    totalItems,
    totalPages,
    currentPage: page,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

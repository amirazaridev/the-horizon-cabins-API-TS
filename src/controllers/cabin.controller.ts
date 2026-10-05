import type { Request, Response } from "express";
import * as cabinService from "../services/cabin.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import type { CabinFilters } from "../types/cabin.types.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const { skip, limit, page } = req.pagination!;
  const { parseQuery } = req;
  const { category: categorySlug } = parseQuery as unknown as { category?: string };
  const filters = parseQuery as unknown as CabinFilters;
  const { data: cabins, meta } = await cabinService.getAllCabins({
    skip,
    limit,
    page,
    categorySlug,
    filters,
  });
  sendSuccess(res, { data: { cabins, meta } });
}
export async function getAllAmenities(req: Request, res: Response) {
  const amenities = await cabinService.getAllAmenities();
  sendSuccess(res, { data: { amenities } });
}

export async function getCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.getCabinById(id);
  sendSuccess(res, { data: { cabin } });
}

export async function getCabinCategories(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const categories = await cabinService.getCabinCategories(id);
  sendSuccess(res, { data: { categories } });
}

/** قیمت‌گذاری عمومی یک بازه‌ی اقامت (بدون ایجاد رزرو). */
export async function getPriceQuote(req: Request, res: Response): Promise<void> {
  const cabinId = Number(req.params.cabinId);
  const { startDate, endDate } = req.parseQuery as { startDate: Date; endDate: Date };

  const quote = await cabinService.getPriceQuote(cabinId, { startDate, endDate });
  sendSuccess(res, { data: { quote } });
}

export async function createCabin(req: Request, res: Response): Promise<void> {
  const cabin = await cabinService.createCabin(
    req.body,
    (req.files as Express.Multer.File[] | undefined) ?? [],
  );
  res.status(201).json({ status: "success", data: { cabin } });
}

export async function updateCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.updateCabin(
    id,
    req.body,
    (req.files as Express.Multer.File[] | undefined) ?? [],
  );
  sendSuccess(res, { data: { cabin } });
}

export async function deleteCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await cabinService.deleteCabin(id);
  sendSuccess(res, { statusCode: 204 });
}

export async function setCabinCategories(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await cabinService.setCabinCategories(id, req.body.categoryIds);
  sendSuccess(res, { statusCode: 204 });
}

export async function removeCabinCategory(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const categoryId = Number(req.params.categoryId);
  await cabinService.removeCabinCategory(id, categoryId);
  sendSuccess(res, { statusCode: 204 });
}

import type { Request, Response } from "express";
import * as categoryService from "../services/category.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  const categories = await categoryService.getAllCategories();
  sendSuccess(res, { data: { categories } });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const category = await categoryService.getCategoryById(id);
  sendSuccess(res, { data: { category } });
}

export async function create(req: Request, res: Response): Promise<void> {
  const category = await categoryService.createCategory(req.body);
  res.status(201).json({ status: "success", data: { category } });
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const category = await categoryService.updateCategory(id, req.body);
  sendSuccess(res, { data: { category } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await categoryService.deleteCategory(id);
  sendSuccess(res, { statusCode: 204 });
}

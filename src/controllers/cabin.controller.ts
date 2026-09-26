import type { Request, Response } from "express";
import * as cabinService from "../services/cabin.service.js";
import { getPagination } from "../utils/pagination.utils.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const { skip, limit, page } = getPagination(req.query);
  const result = await cabinService.getAllCabins({ skip, limit, page });
  sendSuccess(res, { data: { result } });
}
export async function getAllCity(req: Request, res: Response) {
  const cities = await cabinService.getAllCities();
  sendSuccess(res, { data: { cities } });
}

export async function getCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.getCabinById(id);
  sendSuccess(res, { data: { cabin } });
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

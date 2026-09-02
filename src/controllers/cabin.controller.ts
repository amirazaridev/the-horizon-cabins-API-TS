import type { Request, Response } from "express";
import * as cabinService from "../services/cabin.service.js";
import { toCabinDto } from "../utils/cabin.utils.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const cabins = await cabinService.getAllCabins();
  sendSuccess(res, { data: { cabins: cabins.map(toCabinDto) } });
}

export async function getCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.getCabinById(id);
  sendSuccess(res, { data: { cabin } });
}

export async function createCabin(req: Request, res: Response): Promise<void> {
  const cabin = await cabinService.createCabin(req.body);
  sendSuccess(res, { statusCode: 201, data: { cabin } });
}

export async function updateCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.updateCabin(id, req.body);
  sendSuccess(res, { data: { cabin } });
}

export async function deleteCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await cabinService.deleteCabin(id);
  sendSuccess(res, { statusCode: 204 });
}

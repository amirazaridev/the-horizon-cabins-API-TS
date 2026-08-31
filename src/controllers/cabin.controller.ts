import type { Request, Response } from "express";
import * as cabinService from "../services/cabin.service.js";
import { toCabinDto } from "../utils/cabin.utils.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const cabins = await cabinService.getAllCabins();
  res.json({ status: "success", data: { cabins: cabins.map(toCabinDto) } });
}

export async function getCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.getCabinById(id);
  res.json({ status: "success", data: { cabin: toCabinDto(cabin) } });
}

export async function createCabin(req: Request, res: Response): Promise<void> {
  const cabin = await cabinService.createCabin(req.body);
  res.status(201).json({ status: "success", data: { cabin: toCabinDto(cabin) } });
}

export async function updateCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const cabin = await cabinService.updateCabin(id, req.body);
  res.json({ status: "success", data: { cabin: toCabinDto(cabin) } });
}

export async function deleteCabin(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await cabinService.deleteCabin(id);
  res.status(204).json({ status: "success", data: undefined });
}

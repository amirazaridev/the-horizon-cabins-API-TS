import type { Request, Response } from "express";
import * as locationService from "../services/location.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function getRegions(_req: Request, res: Response): Promise<void> {
  const regions = await locationService.getAllRegions();
  sendSuccess(res, { data: { regions } });
}

export async function getRegionCities(req: Request, res: Response): Promise<void> {
  const regionId = Number(req.params.regionId);
  const cities = await locationService.getRegionCities(regionId);
  sendSuccess(res, { data: { cities } });
}

export async function getCities(_req: Request, res: Response): Promise<void> {
  const cities = await locationService.getAllCities();
  sendSuccess(res, { data: { cities } });
}

export async function createCity(req: Request, res: Response): Promise<void> {
  const city = await locationService.createCity(req.body);
  res.status(201).json({ status: "success", data: { city } });
}

export async function updateCity(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const city = await locationService.updateCity(id, req.body);
  sendSuccess(res, { data: { city } });
}

export async function removeCity(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await locationService.deleteCity(id);
  sendSuccess(res, { statusCode: 204 });
}

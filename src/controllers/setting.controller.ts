import type { Request, Response } from "express";
import * as settingService from "../services/setting.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getBody } from "../utils/request.util.js";
import type { UpdateSettingsInput } from "../types/setting.types.js";

export async function getSettings(_req: Request, res: Response): Promise<void> {
  const settings = await settingService.getSettings();
  sendSuccess(res, { data: { settings } });
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const input = getBody<UpdateSettingsInput>(req);
  const result = await settingService.updateSettings(input);
  sendSuccess(res, { data: result });
}

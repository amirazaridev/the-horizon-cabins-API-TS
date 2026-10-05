import type { Request, Response } from "express";
import * as priceCalendarService from "../services/price-calendar.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

//* تقویم قیمت یک کابین (عمومی).
export async function getCabinCalendar(req: Request, res: Response): Promise<void> {
  const cabinId = Number(req.params.cabinId);
  const { from, to } = (req.parseQuery ?? {}) as { from?: Date; to?: Date };

  const calendar = await priceCalendarService.getCabinPriceCalendar(cabinId, { from, to });
  sendSuccess(res, { data: { calendar } });
}

//* rebuild دستی (owner).
export async function rebuild(req: Request, res: Response): Promise<void> {
  const { cabinId } = (req.body ?? {}) as { cabinId?: number };
  const result = await priceCalendarService.rebuildCalendar(cabinId);
  sendSuccess(res, { data: result });
}

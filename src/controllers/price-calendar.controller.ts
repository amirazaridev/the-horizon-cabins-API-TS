import type { Request, Response } from "express";
import * as priceCalendarService from "../services/price-calendar.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getBody, getIntParam, getQuery } from "../utils/request.util.js";

//* تقویم قیمت یک کابین (عمومی).
export async function getCabinCalendar(req: Request, res: Response): Promise<void> {
  const cabinId = getIntParam(req, "cabinId");
  const { from, to } = getQuery<{ from?: Date; to?: Date }>(req);

  const calendar = await priceCalendarService.getCabinPriceCalendar(cabinId, { from, to });
  sendSuccess(res, { data: { calendar } });
}

//* rebuild دستی (owner).
export async function rebuild(req: Request, res: Response): Promise<void> {
  const { cabinId } = getBody<{ cabinId?: number }>(req);
  const result = await priceCalendarService.rebuildCalendar(cabinId);
  sendSuccess(res, { data: result });
}

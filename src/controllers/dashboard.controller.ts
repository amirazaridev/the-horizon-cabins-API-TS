import type { Request, Response } from "express";
import * as dashboardService from "../services/dashboard.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getQuery } from "../utils/request.util.js";
import type { DashboardSnapshotQuery } from "../types/dashboard.types.js";

/**
 * `GET /dashboard/snapshot` — داده‌ی کامل صفحه‌ی Overview داشبورد.
 *
 * ورودی از `validate` (query) آمده و در `req.parseQuery` نشسته است.
 */
export async function getSnapshot(req: Request, res: Response): Promise<void> {
  const query = getQuery<DashboardSnapshotQuery>(req);
  const snapshot = await dashboardService.getDashboardSnapshot(query);
  sendSuccess(res, { data: { snapshot } });
}

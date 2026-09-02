import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import * as userService from "../services/user.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Not authenticated", HTTP_STATUS.UNAUTHORIZED);
  }

  const profile = await userService.getUserProfile(req.user);
  sendSuccess(res, { data: profile });
}

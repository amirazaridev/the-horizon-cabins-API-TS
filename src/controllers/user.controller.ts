import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";
import * as userService from "../services/user.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getBody } from "../utils/request.util.js";
import type { UpdateProfileInput } from "../validations/user.validation.js";

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Not authenticated", HTTP_STATUS.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }

  const profile = await userService.getUserProfile(req.user);
  sendSuccess(res, { data: profile });
}

/**
 * ویرایش پروفایل کاربر جاری.
 *
 * بدنه از قبل با `updateProfileSchema` اعتبارسنجی شده و روی `req.body`
 * نشسته است؛ خروجی همان شکل `GET /user/me` است.
 */
export async function updateMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Not authenticated", HTTP_STATUS.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }

  const input = getBody<UpdateProfileInput>(req);
  const profile = await userService.updateUserProfile(req.user, input);
  sendSuccess(res, { data: profile });
}

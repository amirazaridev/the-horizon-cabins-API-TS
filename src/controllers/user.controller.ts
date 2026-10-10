import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";
import * as userService from "../services/user.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { getBody, getIntParam, getQuery } from "../utils/request.util.js";
import type {
  ListUsersQuery,
  UpdateProfileInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
} from "../validations/user.validation.js";

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

/* ==========================================================================
   پنل مدیریت کاربران
   ========================================================================== */

/** لیست کاربران مهمان (صفحه‌بندی‌شده) با فیلتر جستجو/وضعیت. */
export async function getAll(req: Request, res: Response): Promise<void> {
  const { skip, limit, page } = req.pagination!;
  const query = getQuery<ListUsersQuery>(req);

  const { data: users, meta } = await userService.getUsers({
    skip,
    limit,
    page,
    filters: { q: query.q, active: query.active },
  });

  sendSuccess(res, { data: { users, meta } });
}

/** فعال/غیرفعال‌کردن حساب کاربر. */
export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { active } = getBody<UpdateUserStatusInput>(req);
  const user = await userService.setUserStatus(getIntParam(req, "id"), active);
  sendSuccess(res, { data: { user } });
}

/** تغییر نقش کاربر (حساس — فقط owner). */
export async function updateRole(req: Request, res: Response): Promise<void> {
  const { role } = getBody<UpdateUserRoleInput>(req);
  const user = await userService.setUserRole(getIntParam(req, "id"), role);
  sendSuccess(res, { data: { user } });
}

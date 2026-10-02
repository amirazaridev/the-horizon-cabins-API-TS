import type { Request, Response, NextFunction, CookieOptions } from "express";
import env from "../config/env.js";
import * as authService from "../services/auth.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import type { SafeUser } from "../types/user.types.js";

/**
 * کوکی توکن را روی پاسخ Express ست می‌کند.
 *
 * ⚠️ نکته‌ی معماری (BFF):
 * در این پروژه، مرورگر هرگز مستقیم با این سرور حرف نمی‌زند؛ لایه‌ی
 * Next.js (Server Action) نقش Backend-For-Frontend را دارد. بنابراین این
 * کوکی برای خودِ Next.js معنا دارد، نه برای مرورگر. توکن همچنین در بدنه‌ی
 * پاسخ برگردانده می‌شود تا Next.js بتواند آن را روی مرورگر ست کند.
 */
function sendTokenCookie(res: Response, token: string): void {
  const cookieOptions: CookieOptions = {
    expires: new Date(Date.now() + env.JWT_COOKIE_EXPIRES_IN_MS),
    httpOnly: true,
  };
  if (env.NODE_ENV === "production") {
    cookieOptions.secure = true;
    cookieOptions.sameSite = "none";
  }

  res.cookie("jwt", token, cookieOptions);
}

/**
 * پروفایل امن کاربر برای مصرف در BFF.
 * فقط فیلدهای لازم برای تصمیم‌گیری سمت فرانت برگردانده می‌شود.
 */
function toClientUser(user: SafeUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login(email, password);

    sendTokenCookie(res, token);
    sendSuccess(res, { data: { user: toClientUser(user), token } });
  } catch (error) {
    next(error);
  }
}

export function logout(req: Request, res: Response): void {
  res.clearCookie("jwt");
  sendSuccess(res, { statusCode: HTTP_STATUS.NO_CONTENT });
}

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, token } = await authService.signup(req.body);
    sendTokenCookie(res, token);
    sendSuccess(res, {
      statusCode: HTTP_STATUS.CREATED,
      data: { user: toClientUser(user), token },
    });
  } catch (error) {
    next(error);
  }
}

import type { Request, Response, NextFunction, CookieOptions } from "express";
import env from "../config/env.js";
import * as authService from "../services/auth.service.js";
import * as guestRepository from "../repositories/guest.repository.js";

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

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login(email, password);

    sendTokenCookie(res, token);
    res.status(200).json({ status: "success", data: { user } });
  } catch (error) {
    next(error);
  }
}

export function logout(req: Request, res: Response): void {
  res.clearCookie("jwt");
  res.status(204).json({ status: "success" });
}

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, token } = await authService.signup(req.body);
    sendTokenCookie(res, token);
    res.status(201).json({ status: "success", data: { user } });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ status: "fail", message: "Not authenticated" });
      return;
    }

    const guest = await guestRepository.findGuestByUserId(req.user.id);
    const user = { ...req.user };
    if (user.role === "guest") delete (user as Partial<typeof user>).role;

    res.json({ status: "success", data: { user, guest } });
  } catch (error) {
    next(error);
  }
}

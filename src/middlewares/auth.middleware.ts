import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { verifyToken } from "../utils/jwt.utils.js";
import * as authService from "../services/auth.service.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";

export async function protect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.jwt;

    if (!token) throw new AppError("No valid token provided", HTTP_STATUS.UNAUTHORIZED);

    const decoded = await verifyToken(token);
    const currentUser = await authService.verifyUserFromToken(decoded.id, decoded.iat);

    req.user = currentUser;
    next();
  } catch (error) {
    next(error);
  }
}

export function restrictTo(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError("You don't have permission to perform this action.", HTTP_STATUS.FORBIDDEN),
      );
    }
    next();
  };
}

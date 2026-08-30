import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) =>
  next(
    new AppError(
      `Route ${req.originalUrl} not found!`,
      HTTP_STATUS.NOT_FOUND,
      ErrorCode.ROUTE_NOT_FOUND,
    ),
  );

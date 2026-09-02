import type { Response } from "express";
import { HTTP_STATUS, HttpStatusCode } from "../constants/httpStatus.js";

interface SendSuccessOptions<T> {
  statusCode?: HttpStatusCode;
  message?: string;
  data?: T;
}

export function sendSuccess<T>(res: Response, options: SendSuccessOptions<T> = {}): void {
  const { statusCode = HTTP_STATUS.OK, message, data } = options;

  res.status(statusCode).json({
    status: "success",
    ...(message && { message }),
    ...(data !== undefined && { data }),
  });
}

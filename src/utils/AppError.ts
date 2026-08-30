import { ErrorCode, ErrorCodeType } from "../constants/errorCodes.js";
import { HTTP_STATUS, HttpStatusCode } from "../constants/httpStatus.js";

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCodeType;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

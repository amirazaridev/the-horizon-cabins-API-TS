// src/middlewares/errorHandler.middleware.ts
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
// import { Prisma } from "../generated/prisma/client";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";
import logger from "../config/logger.js";
import env from "../config/env.js";
import { ErrorCode, ErrorCodeType } from "../constants/errorCodes.js";
import { HTTP_STATUS, HttpStatusCode } from "../constants/httpStatus.js";
import { Prisma } from "../generated/prisma/client.js";

const { TokenExpiredError, JsonWebTokenError } = jwt;

const prismaErrorMap: Record<
  string,
  { statusCode: HttpStatusCode; code: ErrorCodeType; message: string }
> = {
  P2002: {
    statusCode: HTTP_STATUS.CONFLICT,
    code: ErrorCode.DUPLICATE_ENTRY,
    message: "This value already exists",
  },
  P2025: {
    statusCode: HTTP_STATUS.NOT_FOUND,
    code: ErrorCode.NOT_FOUND,
    message: "Requested record was not found",
  },
  P2003: {
    statusCode: HTTP_STATUS.BAD_REQUEST,
    code: ErrorCode.INVALID_RELATION,
    message: "Invalid reference to related record",
  },
  P2014: {
    statusCode: HTTP_STATUS.BAD_REQUEST,
    code: ErrorCode.RELATION_VIOLATION,
    message: "This change conflicts with an existing relation",
  },
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  let statusCode: HttpStatusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let code: ErrorCodeType = ErrorCode.INTERNAL_ERROR;
  let message = "An internal server error occurred";
  let details: unknown = undefined;
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err instanceof ZodError) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = ErrorCode.VALIDATION_ERROR;
    message = "Validation failed for the submitted data";
    isOperational = true;
    details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
    logger.info(err.issues);
  }

  //  خطاهای شناخته‌شده Prisma
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaErrorMap[err.code];
    isOperational = true;
    if (mapped) {
      statusCode = mapped.statusCode;
      code = mapped.code;
      message = mapped.message;
    } else {
      statusCode = 400;
      code = ErrorCode.DATABASE_ERROR;
      message = "A database error occurred";
    }
  }
  //  خطای ساختاری Prisma
  else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    code = ErrorCode.DATABASE_VALIDATION_ERROR;
    message = "Submitted data does not match the expected database structure";
    isOperational = true;
  } else if (err instanceof TokenExpiredError) {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    code = ErrorCode.TOKEN_EXPIRED;
    message = "Your session has expired";
    isOperational = true;
  } else if (err instanceof JsonWebTokenError) {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    code = ErrorCode.INVALID_TOKEN;
    message = "Invalid authentication token";
    isOperational = true;
  } else if (err instanceof SyntaxError && "body" in err) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = ErrorCode.INVALID_JSON;
    message = "Malformed JSON in request body";
    isOperational = true;
  } else if (err instanceof Error && env.NODE_ENV !== "production") {
    message = err.message;
    isOperational = false;
  }

  logger[isOperational ? "warn" : "error"]("Request error", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    code,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(statusCode).json({
    status: `${statusCode}`.startsWith("4") ? "fail" : "error",
    code,
    message,
    ...(details ? { errors: details } : {}),
    ...(env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {}),
  });
};

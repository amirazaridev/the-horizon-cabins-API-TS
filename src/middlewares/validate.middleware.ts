import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/AppError.js';

export interface RequestValidationSchema {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schema: RequestValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (schema.body) {
      const result = schema.body.safeParse(req.body);
      if (!result.success) {
        return next(new AppError(formatZodErrors(result.error), 400));
      }
      req.body = result.data;
    }

    if (schema.params) {
      const result = schema.params.safeParse(req.params);
      if (!result.success) {
        return next(new AppError(formatZodErrors(result.error), 400));
      }
      // transform (مثل تبدیل id به number) نوع params رو تغییر می‌ده،
      // پس نیاز به یک cast صریح داریم چون تایپ داخلی Express روی params فقط string می‌پذیره
      req.params = result.data as unknown as Request['params'];
    }

    if (schema.query) {
      const result = schema.query.safeParse(req.query);
      if (!result.success) {
        return next(new AppError(formatZodErrors(result.error), 400));
      }
      req.query = result.data as unknown as Request['query'];
    }

    next();
  };
}

function formatZodErrors(error: import('zod').ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}
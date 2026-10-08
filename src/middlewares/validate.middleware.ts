import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { currentSettings } from "../cache/setting.store.js";
import type { AppSettings } from "../types/setting.types.js";

export interface RequestValidationSchema {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * اسکیمای پویا: چون برخی کران‌ها (مثل بازه‌ی قیمت یا طول اقامت) از جدول
 * `Setting` می‌آیند، این اسکیماها به‌جای مقدار ثابت با تنظیمات مؤثر ساخته
 * می‌شوند. `validate` هم اسکیمای ثابت و هم این factory را می‌پذیرد.
 */
export type RequestValidationSchemaFactory = (settings: AppSettings) => RequestValidationSchema;

export function validate(schema: RequestValidationSchema | RequestValidationSchemaFactory) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resolved = typeof schema === "function" ? schema(currentSettings()) : schema;

    if (resolved.body) {
      const result = resolved.body.parse(req.body);
      req.body = result;
    }

    if (resolved.params) {
      const result = resolved.params.parse(req.params);
      req.params = result as Request["params"];
    }

    if (resolved.query) {
      const result = resolved.query.parse(req.query);
      req.parseQuery = result;
    }

    next();
  };
}

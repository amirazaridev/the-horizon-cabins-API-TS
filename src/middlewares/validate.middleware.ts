import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

export interface RequestValidationSchema {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schema: RequestValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (schema.body) {
      const result = schema.body.parse(req.body);
      req.body = result;
    }

    if (schema.params) {
      const result = schema.params.parse(req.params);
      req.params = result as Request["params"];
    }

    if (schema.query) {
      const result = schema.query.parse(req.query);
      req.query = result as Request["query"];
    }

    next();
  };
}

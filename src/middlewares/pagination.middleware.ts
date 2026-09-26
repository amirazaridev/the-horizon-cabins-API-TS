import { Request, Response, NextFunction } from "express";
import { getPagination } from "../utils/pagination.utils.js";

export const paginationMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  req.pagination = getPagination(req.query);
  next();
};

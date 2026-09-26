import { SafeUser } from "./user.types.ts";
import { PaginationParams } from "../utils/pagination.js";

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      pagination?: PaginationParams;
    }
  }
}

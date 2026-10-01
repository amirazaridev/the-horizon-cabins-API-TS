import type { SafeUser } from "./user.types.js";
import type { PaginationParams } from "./pagination.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      pagination?: PaginationParams;
      parseQuery?: unknown;
    }
  }
}

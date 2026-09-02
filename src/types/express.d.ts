import { SafeUser } from "./user.types.ts";

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

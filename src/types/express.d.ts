import { User } from "../generated/prisma/client.ts";

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, "password">;
    }
  }
}

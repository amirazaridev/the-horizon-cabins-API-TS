import { Prisma } from "../generated/prisma/client.js";

export type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { cabins: true } } };
}>;

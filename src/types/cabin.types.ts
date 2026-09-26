import { Prisma } from "../generated/prisma/client.js";

export type CabinWithCity = Prisma.CabinGetPayload<{
  omit: { cityId: true };
  include: { city: { select: { id: true; name: true } } };
}>;
import type { Cabin } from "../generated/prisma/client.js";

export function toCabinDto(cabin: Cabin) {
  return {
    ...cabin,
    regularPrice: Number(cabin.regularPrice), // BigInt قابل serialize نیست
  };
}

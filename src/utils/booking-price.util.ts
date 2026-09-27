import { differenceInDays } from "date-fns";

export function calculateNumNights(startDate: Date, endDate: Date): number {
  return differenceInDays(endDate, startDate);
}

export function calculateCabinPrice(regularPrice: number, discount: number): number {
  return Math.floor(regularPrice - (regularPrice * discount) / 100);
}

export function calculateTotalPrice(cabinPrice: number, numNights: number): bigint {
  return BigInt(cabinPrice * numNights);
}

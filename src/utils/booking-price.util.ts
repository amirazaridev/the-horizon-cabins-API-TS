export function calculateCabinPrice(regularPrice: number, discount: number): number {
  const finalPrice = regularPrice - (regularPrice * discount) / 100;
  return Math.max(0, Math.floor(finalPrice));
}

export function calculateTotalPrice(cabinPrice: number, numNights: number): number {
  return cabinPrice * numNights;
}

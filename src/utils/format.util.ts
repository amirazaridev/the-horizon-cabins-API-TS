const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: number | string): string {
  return value.toString().replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatCabinCount(count: number): string {
  return `${toPersianDigits(count)} اقامتگاه`;
}

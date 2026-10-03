const DAY_MS = 86_400_000;

/** امروز در timezone محل کابین‌ها، به‌صورت نیمه‌شب UTC (هم‌شکل با ستون‌های Date). */
export function todayInTimezone(timeZone: string, now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // خروجی: 2026-10-03
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** تعداد شب‌ها. چون هر دو تاریخ نیمه‌شب UTC هستند، DST و timezone سرور اثری ندارد. */
export function nightsBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/**
 * افزودن روز به یک تاریخ UTC بدون وابستگی به timezone سرور.
 * از setUTCDate استفاده می‌کنیم تا DST و منطقه‌ی زمانی محلی اثری نداشته باشد.
 */
export function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

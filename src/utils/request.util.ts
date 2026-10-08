import type { Request } from "express";

/**
 * دسترسی type-safe به مقدار parse‌شده‌ی query.
 *
 * `validate` middleware نتیجه‌ی zod را روی `req.parseQuery` می‌گذارد اما نوعش
 * `unknown` است. این helper جای `req.parseQuery as unknown as T` را می‌گیرد و
 * در صورت نبودن مقدار، یک شیء خالی برمی‌گرداند تا destructure امن بماند.
 */
export function getQuery<T>(req: Request): T {
  return (req.parseQuery ?? {}) as T;
}

/** دسترسی type-safe به بدنه‌ی درخواست (بعد از validate). */
export function getBody<T>(req: Request): T {
  return (req.body ?? {}) as T;
}

/** تبدیل یک param به عدد صحیح (مسیرها با zod از قبل فقط رقم را می‌پذیرند). */
export function getIntParam(req: Request, name: string): number {
  return Number(req.params[name]);
}

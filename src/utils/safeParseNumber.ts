/**
 * پارس امن عدد از ورودی‌های رشته‌ای (query/body).
 *
 * فقط رشته‌های عددیِ معتبر (صحیح یا اعشاری، با علامت اختیاری) به `number`
 * تبدیل می‌شوند. هر چیز دیگری — `null`، `""`، `[]`، boolean، `NaN`/`Infinity`
 * و رشته‌های غیرعددی مثل `"abc"` یا `"0x10"` — دست‌نخورده برگردانده می‌شود تا
 * اسکیمای Zod آن را رد کند و هرگز به 0/1 تبدیل نشود.
 */
const NUMERIC_STRING = /^[+-]?\d+(\.\d+)?$/;

export function safeNumber(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (NUMERIC_STRING.test(trimmed)) return Number(trimmed);
  }
  return value;
}

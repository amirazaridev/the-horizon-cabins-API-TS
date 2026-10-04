import { addDaysUtc } from "../../../src/utils/date.util";
import type { PriceRuleKind, PriceRuleType } from "../../../src/generated/prisma/enums";

export interface SamplePriceRule {
  cabinId: number;
  type: PriceRuleType;
  kind: PriceRuleKind;
  percent: number;
  startDate?: Date;
  endDate?: Date;
  weekdays?: number[];
  label: string;
}

/**
 * سه سناریوی واقعی قیمت‌گذاری به‌عنوان داده‌ی نمونه:
 *  ۱. تخفیف بازه‌ای (۵ تا ۱۰ روز آینده، ۲۰٪) برای کابین ۱.
 *  ۲. افزایش قیمت دائمی روزهای هفته (چهارشنبه/پنجشنبه/جمعه، ۱۵٪) برای کابین ۲.
 *  ۳. افزایش قیمت یک‌روزه‌ی تعطیلات (۲۵٪) برای کابین ۳.
 */
export function buildSamplePriceRules(today: Date): SamplePriceRule[] {
  return [
    {
      cabinId: 1,
      type: "discount",
      kind: "dateRange",
      percent: 20,
      startDate: addDaysUtc(today, 5),
      endDate: addDaysUtc(today, 10),
      label: "تخفیف هفته‌ی ویژه",
    },
    {
      cabinId: 2,
      type: "surcharge",
      kind: "weekday",
      percent: 15,
      weekdays: [3, 4, 5],
      label: "افزایش آخر هفته",
    },
    {
      cabinId: 3,
      type: "surcharge",
      kind: "dateRange",
      percent: 25,
      startDate: addDaysUtc(today, 20),
      endDate: addDaysUtc(today, 20),
      label: "تعطیلات رسمی",
    },
  ];
}

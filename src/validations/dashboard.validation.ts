import { z } from "zod";
import { BookingStatus } from "../generated/prisma/enums.js";
import { csvToArray, dateOnlySchema } from "./shared.validation.js";
import { nightsBetween } from "../utils/date.util.js";
import { MAX_DASHBOARD_RANGE_DAYS } from "../constants/dashboard.constants.js";

/**
 * اعتبارسنجی کوئری `GET /dashboard/snapshot`.
 *
 * فیلترهای چندمقداری به‌شکل **CSV** می‌آیند (`?cityIds=1,2,3`) — همان
 * قراردادی که فرانت در URL استفاده می‌کند. مقادیر خالی/نامعتبر حذف می‌شوند.
 */

const COMPARE_MODES = ["prev-period", "prev-year", "none"] as const;
const PAYMENT_STATUSES = ["paid", "unpaid"] as const;

const csvIntArray = z.preprocess(
  csvToArray,
  z.array(z.coerce.number().int().positive()).optional(),
);

const csvStatusArray = z.preprocess(
  csvToArray,
  z.array(z.enum(BookingStatus)).optional(),
);

const csvPaymentStatusArray = z.preprocess(
  csvToArray,
  z.array(z.enum(PAYMENT_STATUSES)).optional(),
);

export const dashboardSnapshotQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    compare: z.enum(COMPARE_MODES).default("prev-period"),
    cityIds: csvIntArray,
    cabinIds: csvIntArray,
    statuses: csvStatusArray,
    paymentStatuses: csvPaymentStatusArray,
  })
  .refine((query) => query.from <= query.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  })
  .refine(
    (query) =>
      nightsBetween(query.from, query.to) + 1 <= MAX_DASHBOARD_RANGE_DAYS,
    {
      message: `Date range cannot exceed ${MAX_DASHBOARD_RANGE_DAYS} days`,
      path: ["to"],
    },
  );

export const dashboardSnapshotValidation = { query: dashboardSnapshotQuerySchema };

export type DashboardSnapshotInput = z.infer<typeof dashboardSnapshotQuerySchema>;

import { prisma, PrismaTransactionClient } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  PriceRule,
  PriceRuleAudit,
  PriceRuleAuditAction,
  PriceRuleKind,
  PriceRuleType,
} from "../generated/prisma/client.js";
import { toPricingRule } from "../mappers/price-rule.mapper.js";
import { todayInTimezone } from "../utils/date.util.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import type { PricingRule } from "../types/pricing.types.js";

type Db = typeof prisma | PrismaTransactionClient;

/** حداکثر تعداد ردیف در هر درج گروهی. */
const INSERT_CHUNK_SIZE = 5_000;

export interface PriceRuleFilters {
  type?: PriceRuleType;
  kind?: PriceRuleKind;
  isActive?: boolean;
}

/** همه‌ی قواعد یک کابین (با فیلتر اختیاری). */
export async function findRulesForCabin(
  cabinId: number,
  filters: PriceRuleFilters = {},
  db: Db = prisma,
): Promise<PriceRule[]> {
  return db.priceRule.findMany({
    where: {
      cabinId,
      ...(filters.type !== undefined && { type: filters.type }),
      ...(filters.kind !== undefined && { kind: filters.kind }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    },
    orderBy: [{ id: "asc" }],
  });
}

/**
 * شرط «قاعده هنوز معتبر است»: قواعد weekday همیشه وارد می‌شوند؛ قواعد dateRange
 * فقط تا وقتی `endDate >= today`. قواعدی که بازه‌شان به پایان رسیده دیگر روی
 * هیچ شبِ آینده‌ای اثر ندارند و صرفاً بار اضافه‌اند.
 */
function activeRuleWhere(cabinId: number | { in: number[] }, today: Date): Prisma.PriceRuleWhereInput {
  const cabinScope = typeof cabinId === "number" ? cabinId : { in: cabinId.in };
  return {
    cabinId: cabinScope,
    isActive: true,
    OR: [{ kind: "weekday" }, { endDate: { gte: today } }],
  };
}

/**
 * فقط قواعد فعال و منقضی‌نشده‌ی یک کابین — ورودی موتور قیمت‌گذاری.
 * خروجی آماده‌ی موتور است (بدون نیاز به کست).
 */
export async function findActiveRulesForCabin(
  cabinId: number,
  db: Db = prisma,
  today: Date = todayInTimezone(TIMEZONE),
): Promise<PricingRule[]> {
  const rows = await db.priceRule.findMany({
    where: activeRuleWhere(cabinId, today),
    orderBy: [{ id: "asc" }],
  });
  return rows.map(toPricingRule);
}

/**
 * قواعد فعال و منقضی‌نشده‌ی چند کابین در **یک کوئری** (به‌جای N+1)، گروه‌بندی‌شده
 * بر اساس `cabinId` در حافظه.
 */
export async function findActiveRulesForCabins(
  cabinIds: number[],
  db: Db = prisma,
  today: Date = todayInTimezone(TIMEZONE),
): Promise<Map<number, PricingRule[]>> {
  const grouped = new Map<number, PricingRule[]>();
  if (cabinIds.length === 0) return grouped;

  const rows = await db.priceRule.findMany({
    where: activeRuleWhere({ in: [...new Set(cabinIds)] }, today),
    orderBy: [{ cabinId: "asc" }, { id: "asc" }],
  });

  for (const row of rows) {
    const list = grouped.get(row.cabinId);
    if (list) list.push(toPricingRule(row));
    else grouped.set(row.cabinId, [toPricingRule(row)]);
  }
  return grouped;
}

export async function findRuleById(id: number, db: Db = prisma): Promise<PriceRule | null> {
  return db.priceRule.findUnique({ where: { id } });
}

export async function createRule(data: Prisma.PriceRuleUncheckedCreateInput, db: Db = prisma): Promise<PriceRule> {
  return db.priceRule.create({ data });
}

/** درج گروهی chunked و بازگرداندن ردیف‌های کامل ساخته‌شده (برای audit). */
export async function createManyRulesAndReturn(
  data: Prisma.PriceRuleUncheckedCreateInput[],
  db: Db = prisma,
): Promise<PriceRule[]> {
  const created: PriceRule[] = [];
  for (let i = 0; i < data.length; i += INSERT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + INSERT_CHUNK_SIZE);
    const rows = await db.priceRule.createManyAndReturn({ data: chunk });
    created.push(...rows);
  }
  return created;
}

export async function updateRule(
  id: number,
  data: Prisma.PriceRuleUncheckedUpdateInput,
  db: Db = prisma,
): Promise<PriceRule> {
  return db.priceRule.update({ where: { id }, data });
}

export async function deleteRule(id: number, db: Db = prisma): Promise<void> {
  await db.priceRule.delete({ where: { id } });
}

/**
 * قفل ردیف کابین با SELECT ... FOR UPDATE.
 * همه‌ی نوشتن‌های قاعده داخل یک تراکنش ابتدا این قفل را می‌گیرند تا دو ادمین
 * هم‌زمان نتوانند سقف‌ها را رد کنند.
 */
export async function lockCabinForUpdate(cabinId: number, db: Db): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT "id" FROM "cabins" WHERE "id" = ${cabinId} FOR UPDATE`,
  );
  return rows.length > 0;
}

/**
 * قفل چند کابین به‌ترتیب صعودی id (جلوگیری از deadlock در bulk).
 * برای هر کابین یک SELECT ... FOR UPDATE جداگانه اجرا می‌شود تا ترتیب قفل قطعی باشد.
 */
export async function lockCabinsForUpdate(cabinIds: number[], db: Db): Promise<void> {
  const sorted = [...new Set(cabinIds)].sort((a, b) => a - b);
  for (const cabinId of sorted) {
    await lockCabinForUpdate(cabinId, db);
  }
}

export interface AuditInput {
  ruleId: number;
  cabinId: number;
  action: PriceRuleAuditAction;
  actorId: number;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export async function createAudit(input: AuditInput, db: Db = prisma): Promise<PriceRuleAudit> {
  return db.priceRuleAudit.create({
    data: {
      ruleId: input.ruleId,
      cabinId: input.cabinId,
      action: input.action,
      actorId: input.actorId,
      ...(input.before !== undefined && { before: input.before }),
      ...(input.after !== undefined && { after: input.after }),
    },
  });
}

export async function findAuditsByRuleId(ruleId: number, db: Db = prisma): Promise<PriceRuleAudit[]> {
  return db.priceRuleAudit.findMany({
    where: { ruleId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** درج گروهی chunked ردیف‌های audit (برای bulk). */
export async function createManyAudits(data: AuditInput[], db: Db = prisma): Promise<number> {
  if (data.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < data.length; i += INSERT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + INSERT_CHUNK_SIZE).map((audit) => ({
      ruleId: audit.ruleId,
      cabinId: audit.cabinId,
      action: audit.action,
      actorId: audit.actorId,
      ...(audit.before !== undefined && { before: audit.before }),
      ...(audit.after !== undefined && { after: audit.after }),
    }));
    const { count } = await db.priceRuleAudit.createMany({ data: chunk });
    total += count;
  }
  return total;
}

export async function findAllCabinIds(db: Db = prisma): Promise<number[]> {
  const cabins = await db.cabin.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  return cabins.map((cabin) => cabin.id);
}

/** تعداد قواعد فعال یک نوع که `percent`شان از سقف داده‌شده بیشتر است. */
export async function countActiveRulesAbovePercent(
  type: PriceRuleType,
  percent: number,
  db: Db = prisma,
): Promise<number> {
  return db.priceRule.count({ where: { type, isActive: true, percent: { gt: percent } } });
}

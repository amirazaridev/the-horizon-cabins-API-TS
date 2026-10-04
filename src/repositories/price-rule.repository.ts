import { prisma, PrismaTransactionClient } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  PriceRule,
  PriceRuleAudit,
  PriceRuleAuditAction,
  PriceRuleKind,
  PriceRuleType,
} from "../generated/prisma/client.js";

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

/** فقط قواعد فعال یک کابین — ورودی موتور قیمت‌گذاری. */
export async function findActiveRulesForCabin(cabinId: number, db: Db = prisma): Promise<PriceRule[]> {
  return db.priceRule.findMany({
    where: { cabinId, isActive: true },
    orderBy: [{ id: "asc" }],
  });
}

export async function findRuleById(id: number, db: Db = prisma): Promise<PriceRule | null> {
  return db.priceRule.findUnique({ where: { id } });
}

export async function findRulesByIds(ids: number[], db: Db = prisma): Promise<PriceRule[]> {
  return db.priceRule.findMany({ where: { id: { in: ids } } });
}

export async function createRule(data: Prisma.PriceRuleUncheckedCreateInput, db: Db = prisma): Promise<PriceRule> {
  return db.priceRule.create({ data });
}

export async function createManyRules(
  data: Prisma.PriceRuleUncheckedCreateInput[],
  db: Db = prisma,
): Promise<number> {
  if (data.length === 0) return 0;
  const { count } = await db.priceRule.createMany({ data });
  return count;
}

/** درج گروهی chunked و بازگرداندن id/cabinId ردیف‌های ساخته‌شده (برای audit). */
export async function createManyRulesAndReturn(
  data: Prisma.PriceRuleUncheckedCreateInput[],
  db: Db = prisma,
): Promise<{ id: number; cabinId: number }[]> {
  const created: { id: number; cabinId: number }[] = [];
  for (let i = 0; i < data.length; i += INSERT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + INSERT_CHUNK_SIZE);
    const rows = await db.priceRule.createManyAndReturn({
      data: chunk,
      select: { id: true, cabinId: true },
    });
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

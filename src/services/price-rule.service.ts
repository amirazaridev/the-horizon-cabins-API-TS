import { Prisma } from "../generated/prisma/client.js";
import type { PriceRule } from "../generated/prisma/client.js";
import { prisma, PrismaTransactionClient } from "../config/database.js";
import logger from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import { getPricingLimits } from "./setting.store.js";
import { addDaysUtc, todayInTimezone } from "../utils/date.util.js";
import { validateRuleSet } from "../utils/pricing.engine.js";
import { withSerializableRetry } from "../utils/transaction.util.js";
import * as priceRuleRepository from "../repositories/price-rule.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import {
  getCalendarWindow,
  rebuildCabinPriceCalendar,
  rebuildCabinPriceCalendarStandalone,
  resolveAffectedCalendarRange,
} from "./price-calendar.service.js";
import type {
  PricingLimits,
  PricingRule,
  RuleLimitViolation,
  RuleType,
} from "../types/pricing.types.js";
import { auditSnapshot, toPricingRule, ymd } from "../mappers/price-rule.mapper.js";
import type {
  BulkCreatePriceRulesInput,
  CreatePriceRuleInput,
  UpdatePriceRuleInput,
} from "../validations/price-rule.validation.js";

type CreateRuleInput = CreatePriceRuleInput;
type UpdateRuleInput = UpdatePriceRuleInput;
type BulkInput = BulkCreatePriceRulesInput;

function formatViolation(violation: RuleLimitViolation) {
  return {
    type: violation.type,
    reason: violation.reason,
    from: ymd(violation.from),
    to: ymd(violation.to),
    found: violation.found,
    limit: violation.limit,
  };
}

function buildLimitError(violations: RuleLimitViolation[]): AppError {
  return new AppError(
    "The requested change would exceed the pricing limits",
    HTTP_STATUS.CONFLICT,
    ErrorCode.PRICE_RULE_LIMIT_EXCEEDED,
    true,
    { violations: violations.map(formatViolation) },
  );
}

function invalidRule(message: string): AppError {
  return new AppError(message, HTTP_STATUS.BAD_REQUEST, ErrorCode.PRICE_RULE_INVALID);
}

function assertPercentWithinCap(type: RuleType, percent: number, limits: PricingLimits): void {
  const cap =
    type === "discount" ? limits.maxTotalDiscountPercent : limits.maxTotalSurchargePercent;
  if (percent > cap) {
    throw invalidRule(`percent cannot exceed ${cap} for a ${type} rule`);
  }
}

interface DateRuleShape {
  kind: "dateRange" | "weekday";
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * `endDate >= today` و `endDate <= today + PRICE_RULE_MAX_FUTURE_DAYS`
 * (فقط برای قواعد dateRange).
 */
function assertEndDateWithinRange(
  rule: DateRuleShape,
  today: Date,
  maxFutureDays: number,
): void {
  if (rule.kind !== "dateRange" || !rule.endDate) return;

  if (rule.endDate.getTime() < today.getTime()) {
    throw new AppError(
      "endDate cannot be in the past",
      HTTP_STATUS.BAD_REQUEST,
      ErrorCode.PRICE_RULE_END_DATE_IN_PAST,
    );
  }
  if (rule.endDate.getTime() > addDaysUtc(today, maxFutureDays).getTime()) {
    throw invalidRule(`endDate cannot be more than ${maxFutureDays} days in the future`);
  }
}

// ==================================================================
// Read
// ==================================================================

export async function listRules(
  cabinId: number,
  filters: priceRuleRepository.PriceRuleFilters,
): Promise<PriceRule[]> {
  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

  return priceRuleRepository.findRulesForCabin(cabinId, filters);
}

/** history قاعده — حتی بعد از hard-delete کار می‌کند (audit FK ندارد). */
export async function getRuleHistory(id: number) {
  const audits = await priceRuleRepository.findAuditsByRuleId(id);
  if (audits.length === 0) {
    const rule = await priceRuleRepository.findRuleById(id);
    if (!rule) {
      throw new AppError("Price rule not found", HTTP_STATUS.NOT_FOUND, ErrorCode.PRICE_RULE_NOT_FOUND);
    }
  }
  return audits;
}

// ==================================================================
// Create
// ==================================================================

export async function createRule(
  cabinId: number,
  input: CreateRuleInput,
  actorId: number,
): Promise<PriceRule> {
  const now = new Date();
  const today = todayInTimezone(TIMEZONE, now);
  const limits = getPricingLimits();
  const isActive = input.isActive ?? true;

  assertEndDateWithinRange(
    { kind: input.kind, startDate: input.startDate ?? null, endDate: input.endDate ?? null },
    today,
    limits.priceRuleMaxFutureDays,
  );

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const locked = await priceRuleRepository.lockCabinForUpdate(cabinId, tx);
        if (!locked) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

        const activeRules = await priceRuleRepository.findActiveRulesForCabin(cabinId, tx, today);
        const candidate: PricingRule = {
          id: 0,
          type: input.type,
          kind: input.kind,
          percent: input.percent,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          weekdays: input.weekdays ?? [],
          isActive,
          label: input.label ?? null,
        };

        //* نامزدِ غیرفعال نباید در اعتبارسنجی سقف‌ها شرکت کند (هم‌راستا با updateRule).
        const candidateSet = candidate.isActive ? [...activeRules, candidate] : activeRules;
        const violations = validateRuleSet(candidateSet, today, limits);
        if (violations.length > 0) throw buildLimitError(violations);

        const created = await priceRuleRepository.createRule(
          {
            cabinId,
            type: input.type,
            kind: input.kind,
            percent: input.percent,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            weekdays: input.weekdays ?? [],
            label: input.label ?? null,
            isActive,
            createdById: actorId,
            updatedById: actorId,
          },
          tx,
        );

        await priceRuleRepository.createAudit(
          {
            ruleId: created.id,
            cabinId,
            action: "created",
            actorId,
            after: auditSnapshot(created),
          },
          tx,
        );

        if (created.isActive) {
          const window = getCalendarWindow(now);
          const affected = resolveAffectedCalendarRange(null, toPricingRule(created), window);
          if (affected) await rebuildCabinPriceCalendar(tx, cabinId, affected, now);
        }

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ==================================================================
// Update
// ==================================================================

function mergeRuleUpdate(existing: PriceRule, input: UpdateRuleInput): PricingRule {
  return {
    id: existing.id,
    type: existing.type,
    kind: existing.kind,
    percent: input.percent ?? existing.percent,
    startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
    endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
    weekdays: input.weekdays !== undefined ? input.weekdays : existing.weekdays,
    isActive: input.isActive ?? existing.isActive,
    label: input.label !== undefined ? input.label : existing.label,
  };
}

function assertUpdateShapeMatchesKind(existing: PriceRule, input: UpdateRuleInput): void {
  if (existing.kind === "dateRange" && input.weekdays !== undefined) {
    throw invalidRule("weekdays cannot be updated on a dateRange rule");
  }
  if (existing.kind === "weekday" && (input.startDate !== undefined || input.endDate !== undefined)) {
    throw invalidRule("dates cannot be updated on a weekday rule");
  }
}

export async function updateRule(
  id: number,
  input: UpdateRuleInput,
  actorId: number,
): Promise<PriceRule> {
  const now = new Date();
  const today = todayInTimezone(TIMEZONE, now);
  const limits = getPricingLimits();

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const existing = await priceRuleRepository.findRuleById(id, tx);
        if (!existing) {
          throw new AppError(
            "Price rule not found",
            HTTP_STATUS.NOT_FOUND,
            ErrorCode.PRICE_RULE_NOT_FOUND,
          );
        }

        const locked = await priceRuleRepository.lockCabinForUpdate(existing.cabinId, tx);
        if (!locked) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

        assertUpdateShapeMatchesKind(existing, input);
        if (input.percent !== undefined) assertPercentWithinCap(existing.type, input.percent, limits);

        const merged = mergeRuleUpdate(existing, input);

        if (merged.kind === "dateRange" && merged.startDate && merged.endDate) {
          if (merged.startDate.getTime() > merged.endDate.getTime()) {
            throw invalidRule("startDate must be before or equal to endDate");
          }
        }

        const touchesDates = input.startDate !== undefined || input.endDate !== undefined;
        const isReactivation = input.isActive === true && !existing.isActive;
        if (touchesDates || isReactivation) {
          assertEndDateWithinRange(merged, today, limits.priceRuleMaxFutureDays);
        }

        const activeRules = await priceRuleRepository.findActiveRulesForCabin(existing.cabinId, tx, today);
        const others = activeRules.filter((rule) => rule.id !== id);
        const candidate = merged.isActive ? [...others, merged] : others;

        const violations = validateRuleSet(candidate, today, limits);
        if (violations.length > 0) throw buildLimitError(violations);

        const updated = await priceRuleRepository.updateRule(
          id,
          {
            percent: merged.percent,
            startDate: merged.startDate,
            endDate: merged.endDate,
            weekdays: merged.weekdays,
            label: merged.label,
            isActive: merged.isActive,
            updatedById: actorId,
          },
          tx,
        );

        const toggledActivation = input.isActive !== undefined && input.isActive !== existing.isActive;
        const action = toggledActivation
          ? input.isActive
            ? "activated"
            : "deactivated"
          : "updated";

        await priceRuleRepository.createAudit(
          {
            ruleId: id,
            cabinId: existing.cabinId,
            action,
            actorId,
            before: auditSnapshot(existing),
            after: auditSnapshot(updated),
          },
          tx,
        );

        //* تغییرِ صرفِ label (یا هر فیلدی که روی قیمت اثر ندارد) نباید تقویم را
        //* بازسازی کند. فقط وقتی یکی از فیلدهای مؤثر واقعاً عوض شده، rebuild می‌کنیم.
        if (affectsCalendar(existing, updated)) {
          const window = getCalendarWindow(now);
          const beforeForRange = existing.isActive ? toPricingRule(existing) : null;
          const afterForRange = updated.isActive ? toPricingRule(updated) : null;
          const affected = resolveAffectedCalendarRange(beforeForRange, afterForRange, window);
          if (affected) await rebuildCabinPriceCalendar(tx, existing.cabinId, affected, now);
        }

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/** آیا تفاوت `before`/`after` روی اعداد تقویم اثر می‌گذارد؟ (label بی‌اثر است) */
function affectsCalendar(before: PriceRule, after: PriceRule): boolean {
  if (before.percent !== after.percent) return true;
  if (before.isActive !== after.isActive) return true;
  if (before.startDate?.getTime() !== after.startDate?.getTime()) return true;
  if (before.endDate?.getTime() !== after.endDate?.getTime()) return true;

  const b = [...before.weekdays].sort((x, y) => x - y);
  const a = [...after.weekdays].sort((x, y) => x - y);
  return b.length !== a.length || b.some((day, i) => day !== a[i]);
}

// ==================================================================
// Delete (owner only at the route level)
// ==================================================================

export async function deleteRule(id: number, actorId: number): Promise<void> {
  const now = new Date();

  await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const existing = await priceRuleRepository.findRuleById(id, tx);
        if (!existing) {
          throw new AppError(
            "Price rule not found",
            HTTP_STATUS.NOT_FOUND,
            ErrorCode.PRICE_RULE_NOT_FOUND,
          );
        }

        const locked = await priceRuleRepository.lockCabinForUpdate(existing.cabinId, tx);
        if (!locked) throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);

        await priceRuleRepository.deleteRule(id, tx);

        await priceRuleRepository.createAudit(
          {
            ruleId: id,
            cabinId: existing.cabinId,
            action: "deleted",
            actorId,
            before: auditSnapshot(existing),
          },
          tx,
        );

        if (existing.isActive) {
          const window = getCalendarWindow(now);
          const affected = resolveAffectedCalendarRange(toPricingRule(existing), null, window);
          if (affected) await rebuildCabinPriceCalendar(tx, existing.cabinId, affected, now);
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ==================================================================
// Bulk (owner only at the route level) — atomic writes, post-commit rebuild
// ==================================================================

export interface BulkResult {
  count: number;
  cabinIds: number[];
  /** کابین‌هایی که تقویمشان بعد از commit از نو ساخته شد. */
  calendarsRebuilt?: number;
  /** کابین‌هایی که بازسازی تقویمشان شکست خورد (خطا لاگ شده، bulk موفق است). */
  calendarsFailed?: number;
}

/** حداکثر تعداد rebuildهای هم‌زمانِ پس از commit (تا pool اشباع نشود). */
const REBUILD_CONCURRENCY = 4;

export async function bulkCreateRules(input: BulkInput, actorId: number): Promise<BulkResult> {
  const now = new Date();
  const today = todayInTimezone(TIMEZONE, now);
  const limits = getPricingLimits();
  const rule = input.rule;
  const isActive = rule.isActive ?? true;

  assertEndDateWithinRange(
    { kind: rule.kind, startDate: rule.startDate ?? null, endDate: rule.endDate ?? null },
    today,
    limits.priceRuleMaxFutureDays,
  );

  const candidate: PricingRule = {
    id: 0,
    type: rule.type,
    kind: rule.kind,
    percent: rule.percent,
    startDate: rule.startDate ?? null,
    endDate: rule.endDate ?? null,
    weekdays: rule.weekdays ?? [],
    isActive,
    label: rule.label ?? null,
  };

  //* تراکنش فقط می‌نویسد؛ rebuild تقویم عمداً بیرون از آن انجام می‌شود تا از
  //* timeout تعاملی و تراکم write-conflict روی انبوهی از کابین‌ها فرار کنیم.
  const { count, cabinIds } = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const targetIds = await resolveBulkTargets(input, tx);

        if (targetIds.length === 0) {
          throw new AppError(
            "No cabins to apply the rule to",
            HTTP_STATUS.BAD_REQUEST,
            ErrorCode.PRICE_RULE_BULK_INVALID,
          );
        }

        //* قفل همه‌ی کابین‌ها به‌ترتیب صعودی id (جلوگیری از deadlock).
        await priceRuleRepository.lockCabinsForUpdate(targetIds, tx);

        //* یک کوئری برای قواعد فعال همه‌ی کابین‌ها (به‌جای N+1).
        const activeByCabin = await priceRuleRepository.findActiveRulesForCabins(
          targetIds,
          tx,
          today,
        );

        //* اعتبارسنجی همه‌ی کابین‌ها قبل از هر نوشتن (atomic: همه یا هیچ).
        //* نامزدِ غیرفعال در سقف‌ها شرکت نمی‌کند (هم‌راستا با create/update).
        const conflicts: { cabinId: number; violations: ReturnType<typeof formatViolation>[] }[] = [];
        for (const cabinId of targetIds) {
          const activeRules = activeByCabin.get(cabinId) ?? [];
          const candidateSet = candidate.isActive ? [...activeRules, candidate] : activeRules;
          const violations = validateRuleSet(candidateSet, today, limits);
          if (violations.length > 0) {
            conflicts.push({ cabinId, violations: violations.map(formatViolation) });
          }
        }
        if (conflicts.length > 0) {
          throw new AppError(
            "The bulk operation would exceed the pricing limits for some cabins",
            HTTP_STATUS.CONFLICT,
            ErrorCode.PRICE_RULE_LIMIT_EXCEEDED,
            true,
            { conflicts },
          );
        }

        const createdRules = await priceRuleRepository.createManyRulesAndReturn(
          targetIds.map((cabinId) => ({
            cabinId,
            type: rule.type,
            kind: rule.kind,
            percent: rule.percent,
            startDate: rule.startDate ?? null,
            endDate: rule.endDate ?? null,
            weekdays: rule.weekdays ?? [],
            label: rule.label ?? null,
            isActive,
            createdById: actorId,
            updatedById: actorId,
          })),
          tx,
        );

        await priceRuleRepository.createManyAudits(
          createdRules.map((created) => ({
            ruleId: created.id,
            cabinId: created.cabinId,
            action: "created" as const,
            actorId,
            after: auditSnapshot(created),
          })),
          tx,
        );

        return { count: createdRules.length, cabinIds: targetIds };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        //* تراکنش‌های انبوه ممکن است از پیش‌فرض ۵ ثانیه‌ی Prisma عبور کنند.
        maxWait: 5_000,
        timeout: 30_000,
      },
    ),
  );

  //* بعد از commit: تقویم هر کابین، فقط روی بازه‌ی متأثر (نه کل پنجره).
  const rebuildStats = isActive
    ? await rebuildCalendarsAfterCommit(cabinIds, candidate, now)
    : { rebuilt: 0, failed: 0 };

  return {
    count,
    cabinIds,
    calendarsRebuilt: rebuildStats.rebuilt,
    calendarsFailed: rebuildStats.failed,
  };
}

/** تعیین کابین‌های هدف (همه یا مجموعه‌ی صریح) با یک کوئری. */
async function resolveBulkTargets(
  input: BulkInput,
  tx: PrismaTransactionClient,
): Promise<number[]> {
  const allCabinIds = await priceRuleRepository.findAllCabinIds(tx);

  if (input.allCabins) return allCabinIds;

  const existing = new Set(allCabinIds);
  const requested = [...new Set(input.cabinIds ?? [])].sort((a, b) => a - b);
  const missing = requested.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new AppError(
      "One or more cabins were not found",
      HTTP_STATUS.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      true,
      { missingCabinIds: missing },
    );
  }
  return requested;
}

/**
 * بازسازی تقویم کابین‌ها بعد از commit، هر کابین به‌صورت مستقل (خطای یکی،
 * بقیه را متوقف نمی‌کند) و با هم‌زمانی محدود.
 */
async function rebuildCalendarsAfterCommit(
  cabinIds: number[],
  rule: PricingRule,
  now: Date,
): Promise<{ rebuilt: number; failed: number }> {
  const window = getCalendarWindow(now);
  const affected = resolveAffectedCalendarRange(null, rule, window);
  if (!affected) return { rebuilt: 0, failed: 0 };

  let rebuilt = 0;
  let failed = 0;

  for (let i = 0; i < cabinIds.length; i += REBUILD_CONCURRENCY) {
    const batch = cabinIds.slice(i, i + REBUILD_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((cabinId) =>
        rebuildCabinPriceCalendarStandalone(cabinId, affected, now).catch((error) => {
          logger.error("Calendar rebuild failed after bulk rule creation", { cabinId, error });
          throw error;
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") rebuilt += 1;
      else failed += 1;
    }
  }

  return { rebuilt, failed };
}

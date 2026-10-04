import { Prisma } from "../generated/prisma/client.js";
import type { PriceRule } from "../generated/prisma/client.js";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { TIMEZONE } from "../constants/booking.constants.js";
import {
  MAX_TOTAL_DISCOUNT_PERCENT,
  MAX_TOTAL_SURCHARGE_PERCENT,
  getPricingLimits,
} from "../constants/pricing.constants.js";
import { addDaysUtc, todayInTimezone } from "../utils/date.util.js";
import { validateRuleSet } from "../utils/pricing.engine.js";
import { withSerializableRetry } from "../utils/transaction.util.js";
import * as priceRuleRepository from "../repositories/price-rule.repository.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import {
  getCalendarWindow,
  rebuildCabinPriceCalendar,
  resolveAffectedCalendarRange,
} from "./price-calendar.service.js";
import type { PricingRule, RuleLimitViolation, RuleType } from "../types/pricing.types.js";
import type { z } from "zod";
import type {
  bulkCreatePriceRulesBodySchema,
  createPriceRuleBodySchema,
  updatePriceRuleBodySchema,
} from "../validations/price-rule.validation.js";

type CreateRuleInput = z.infer<typeof createPriceRuleBodySchema>;
type UpdateRuleInput = z.infer<typeof updatePriceRuleBodySchema>;
type BulkInput = z.infer<typeof bulkCreatePriceRulesBodySchema>;

/** نگاشت ردیف Prisma به شکل موردنیاز موتور قیمت‌گذاری. */
function toPricingRule(rule: PriceRule): PricingRule {
  return {
    id: rule.id,
    type: rule.type,
    kind: rule.kind,
    percent: rule.percent,
    startDate: rule.startDate,
    endDate: rule.endDate,
    weekdays: rule.weekdays,
    isActive: rule.isActive,
    label: rule.label,
  };
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** اسنپ‌شات JSON برای history. */
function auditSnapshot(rule: PriceRule) {
  return {
    id: rule.id,
    cabinId: rule.cabinId,
    type: rule.type,
    kind: rule.kind,
    percent: rule.percent,
    startDate: rule.startDate ? ymd(rule.startDate) : null,
    endDate: rule.endDate ? ymd(rule.endDate) : null,
    weekdays: rule.weekdays,
    label: rule.label,
    isActive: rule.isActive,
  };
}

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

function assertPercentWithinCap(type: RuleType, percent: number): void {
  const cap = type === "discount" ? MAX_TOTAL_DISCOUNT_PERCENT : MAX_TOTAL_SURCHARGE_PERCENT;
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

export async function getRuleById(id: number): Promise<PriceRule> {
  const rule = await priceRuleRepository.findRuleById(id);
  if (!rule) throw new AppError("Price rule not found", HTTP_STATUS.NOT_FOUND, ErrorCode.PRICE_RULE_NOT_FOUND);
  return rule;
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
  const limits = await getPricingLimits();
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

        const activeRules = await priceRuleRepository.findActiveRulesForCabin(cabinId, tx);
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

        const violations = validateRuleSet(
          [...activeRules.map(toPricingRule), candidate],
          today,
          limits,
        );
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
  const limits = await getPricingLimits();

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
        if (input.percent !== undefined) assertPercentWithinCap(existing.type, input.percent);

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

        const activeRules = await priceRuleRepository.findActiveRulesForCabin(existing.cabinId, tx);
        const others = activeRules.filter((rule) => rule.id !== id).map(toPricingRule);
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

        const window = getCalendarWindow(now);
        const beforeForRange = existing.isActive ? toPricingRule(existing) : null;
        const afterForRange = updated.isActive ? toPricingRule(updated) : null;
        const affected = resolveAffectedCalendarRange(beforeForRange, afterForRange, window);
        if (affected) await rebuildCabinPriceCalendar(tx, existing.cabinId, affected, now);

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
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
// Bulk (owner only at the route level) — atomic
// ==================================================================

export interface BulkResult {
  count: number;
  cabinIds: number[];
}

export async function bulkCreateRules(input: BulkInput, actorId: number): Promise<BulkResult> {
  const now = new Date();
  const today = todayInTimezone(TIMEZONE, now);
  const limits = await getPricingLimits();
  const rule = input.rule;
  const isActive = rule.isActive ?? true;

  assertEndDateWithinRange(
    { kind: rule.kind, startDate: rule.startDate ?? null, endDate: rule.endDate ?? null },
    today,
    limits.priceRuleMaxFutureDays,
  );

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const allCabinIds = await priceRuleRepository.findAllCabinIds(tx);

        let targetIds: number[];
        if (input.allCabins) {
          targetIds = allCabinIds;
        } else {
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
          targetIds = requested;
        }

        if (targetIds.length === 0) {
          throw new AppError(
            "No cabins to apply the rule to",
            HTTP_STATUS.BAD_REQUEST,
            ErrorCode.PRICE_RULE_BULK_INVALID,
          );
        }

        // قفل همه‌ی کابین‌ها به‌ترتیب صعودی id (جلوگیری از deadlock).
        await priceRuleRepository.lockCabinsForUpdate(targetIds, tx);

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

        // اعتبارسنجی همه‌ی کابین‌ها قبل از هر نوشتن (atomic: همه یا هیچ).
        const conflicts: { cabinId: number; violations: ReturnType<typeof formatViolation>[] }[] = [];
        for (const cabinId of targetIds) {
          const activeRules = await priceRuleRepository.findActiveRulesForCabin(cabinId, tx);
          const violations = validateRuleSet(
            [...activeRules.map(toPricingRule), candidate],
            today,
            limits,
          );
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

        const created = await priceRuleRepository.createManyRulesAndReturn(
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
          created.map((row) => ({
            ruleId: row.id,
            cabinId: row.cabinId,
            action: "created" as const,
            actorId,
          })),
          tx,
        );

        if (isActive) {
          for (const cabinId of targetIds) {
            await rebuildCabinPriceCalendar(tx, cabinId, undefined, now);
          }
        }

        return { count: created.length, cabinIds: targetIds };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

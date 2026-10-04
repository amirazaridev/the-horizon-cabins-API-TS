import { prisma } from "../../src/config/database";
import { todayInTimezone } from "../../src/utils/date.util";
import { TIMEZONE } from "../../src/constants/booking.constants";
import { buildSamplePriceRules } from "./data/price-rule";

/** ایمیل کاربر owner داده‌ی seed. */
export const SEED_OWNER_EMAIL = "owner@horizon.local";
/** رمز عبور پیش‌فرض owner داده‌ی seed (فقط محیط توسعه). */
export const SEED_OWNER_PASSWORD = "HorizonOwner123!";

/**
 * ساخت (یا یافتن) کاربر owner که قواعد نمونه به او نسبت داده می‌شوند.
 *
 * از `prisma.user.create` استفاده می‌کنیم (نه upsert) تا extension هش‌کردن
 * رمز عبور فعال شود؛ upsert توسط extension گرفته نمی‌شود.
 */
export async function seedOwnerUser(): Promise<number> {
  const existing = await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL } });
  if (existing) return existing.id;

  const owner = await prisma.user.create({
    data: {
      email: SEED_OWNER_EMAIL,
      password: SEED_OWNER_PASSWORD,
      role: "owner",
      active: true,
    },
  });
  return owner.id;
}

/**
 * جایگزینی قواعد نمونه‌ی قیمت‌گذاری. idempotent است: قواعد و history قبلی
 * پاک و از نو ساخته می‌شوند (داده‌ی dev است).
 */
export async function seedPriceRules(): Promise<number> {
  const ownerId = await seedOwnerUser();
  const today = todayInTimezone(TIMEZONE);
  const samples = buildSamplePriceRules(today);

  await prisma.$transaction(async (tx) => {
    await tx.priceRuleAudit.deleteMany({});
    await tx.priceRule.deleteMany({});
    await tx.priceRule.createMany({
      data: samples.map((sample) => ({
        cabinId: sample.cabinId,
        type: sample.type,
        kind: sample.kind,
        percent: sample.percent,
        startDate: sample.startDate ?? null,
        endDate: sample.endDate ?? null,
        weekdays: sample.weekdays ?? [],
        label: sample.label,
        isActive: true,
        createdById: ownerId,
        updatedById: ownerId,
      })),
    });
  });

  return samples.length;
}

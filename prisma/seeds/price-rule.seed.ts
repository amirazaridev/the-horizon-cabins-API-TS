import { prisma } from "../../src/config/database";
import { todayInTimezone } from "../../src/utils/date.util";
import { TIMEZONE } from "../../src/constants/booking.constants";
import { buildSamplePriceRules } from "./data/price-rule";


export async function seedPriceRules(ownerId: number): Promise<number> {
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

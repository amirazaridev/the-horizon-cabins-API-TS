import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { validateStayRange } from "../utils/booking-date.util.js";
import { quoteStayPrice } from "../utils/pricing.engine.js";
import { getPricingLimits, currentSettings } from "./setting.store.js";
import * as cabinRepository from "../repositories/cabin.repository.js";
import * as bookingRepository from "../repositories/booking.repository.js";
import * as priceRuleRepository from "../repositories/price-rule.repository.js";
import logger from "../config/logger.js";

/**
 * قیمت‌گذاری عمومی یک بازه‌ی اقامت — بدون ایجاد رزرو.
 *
 * این سرویس فقط روی موتور قیمت‌گذاری و repositoryها تکیه می‌کند؛ نه
 * booking.service را ایمپورت می‌کند و نه از آن ایمپورت می‌شود (بدون حلقه).
 */
export async function getPriceQuote(
  cabinId: number,
  range: { startDate: Date; endDate: Date },
): Promise<{
  cabinId: number;
  startDate: Date;
  endDate: Date;
  nights: {
    date: Date;
    basePrice: number;
    discountPercent: number;
    surchargePercent: number;
    finalPrice: number;
    appliedRules: unknown;
  }[];
  totalPrice: number;
  available: boolean;
}> {
  const now = new Date();
  const { startDate, endDate } = validateStayRange(range, currentSettings(), now);

  const cabin = await cabinRepository.findCabinById(cabinId);
  if (!cabin) {
    throw new AppError("Cabin not found", HTTP_STATUS.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  const limits = getPricingLimits();
  const activeRules = await priceRuleRepository.findActiveRulesForCabin(cabinId);

  const quote = quoteStayPrice(cabin.regularPrice, activeRules, startDate, endDate, limits);
  if (quote.limitsExceeded) {
    logger.error("Pricing limits exceeded by stored rules while quoting a stay", { cabinId });
  }

  const hasOverlap = await bookingRepository.hasOverlappingBooking(
    cabinId,
    startDate,
    endDate,
    now,
  );

  return {
    cabinId,
    startDate,
    endDate,
    nights: quote.nights.map((night) => ({
      date: night.date,
      basePrice: night.basePrice,
      discountPercent: night.discountPercent,
      surchargePercent: night.surchargePercent,
      finalPrice: night.finalPrice,
      appliedRules: night.appliedRules,
    })),
    totalPrice: quote.totalPrice,
    available: !hasOverlap,
  };
}

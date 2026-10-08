import { DEFAULT_SETTINGS } from "../../src/constants/setting.constants.js";
import { deriveSettings, toPricingLimits } from "../../src/cache/setting.store.js";
import type { PricingLimits } from "../../src/types/pricing.types.js";

/**
 * سقف‌های پیش‌فرض قیمت‌گذاری — برای تست‌هایی که یک شیء `PricingLimits` کامل
 * می‌خواهند. مقادیر از `DEFAULT_SETTINGS` مشتق می‌شوند (تنها منبع پیش‌فرض‌ها).
 */
export const DEFAULT_PRICING_LIMITS: PricingLimits = toPricingLimits(
  deriveSettings(DEFAULT_SETTINGS),
);

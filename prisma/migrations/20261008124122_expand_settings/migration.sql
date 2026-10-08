/*
  Expand the singleton `settings` row into the single source of truth for the
  configurable booking and pricing limits.

  - `breakfast_price` is removed (unused).
  - New NOT NULL columns carry the same defaults as the code constants, so the
    migration is a no-op behaviourally until an admin changes a value.
  - CHECK constraints enforce the *shape* of the values; the cross-field
    invariant (e.g. maxRegularPrice vs maxNightlyPrice/maxSurcharge) is enforced
    in the service layer where the merged row is available.
*/

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "breakfast_price",
ADD COLUMN     "max_advance_booking_days" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "max_discounts_per_night" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "max_nightly_price" INTEGER NOT NULL DEFAULT 70000000,
ADD COLUMN     "max_pending_bookings_per_guest" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "max_regular_price" INTEGER NOT NULL DEFAULT 35000000,
ADD COLUMN     "max_surcharges_per_night" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "max_total_discount_percent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "max_total_surcharge_percent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "min_regular_price" INTEGER NOT NULL DEFAULT 1000000,
ADD COLUMN     "payment_deadline_minutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "price_rule_max_future_days" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "starting_price_window_days" INTEGER NOT NULL DEFAULT 30;

-- ============================================================================
-- CHECK constraints (value shape).
-- ============================================================================
ALTER TABLE "settings"
    ADD CONSTRAINT "settings_booking_length_range" CHECK (
        "min_booking_length" >= 1 AND "max_booking_length" >= "min_booking_length"
    );

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_max_guests_positive" CHECK ("max_guests" >= 1);

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_advance_days_positive" CHECK ("max_advance_booking_days" >= 1);

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_pending_bookings_non_negative" CHECK ("max_pending_bookings_per_guest" >= 0);

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_payment_deadline_positive" CHECK ("payment_deadline_minutes" >= 1);

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_rule_counts_non_negative" CHECK (
        "max_discounts_per_night" >= 0 AND "max_surcharges_per_night" >= 0
    );

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_discount_percent_range" CHECK (
        "max_total_discount_percent" >= 0 AND "max_total_discount_percent" <= 100
    );

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_surcharge_percent_non_negative" CHECK ("max_total_surcharge_percent" >= 0);

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_price_bounds" CHECK (
        "min_regular_price" >= 1
        AND "max_regular_price" >= "min_regular_price"
        AND "max_nightly_price" >= "min_regular_price"
    );

ALTER TABLE "settings"
    ADD CONSTRAINT "settings_windows_positive" CHECK (
        "starting_price_window_days" >= 1 AND "price_rule_max_future_days" >= 1
    );

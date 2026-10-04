-- ============================================================================
-- Dynamic pricing: new tables, CHECK constraints and legacy backfills.
--
-- This migration is safe to run on a database that already contains legacy
-- rows (cabins, bookings) and is also re-runnable from scratch
-- (`migrate reset` + seed): every backfill is a no-op on empty tables.
-- ============================================================================

-- CreateEnum
CREATE TYPE "price_rule_type" AS ENUM ('discount', 'surcharge');

-- CreateEnum
CREATE TYPE "price_rule_kind" AS ENUM ('date_range', 'weekday');

-- CreateEnum
CREATE TYPE "price_rule_audit_action" AS ENUM ('created', 'updated', 'activated', 'deactivated', 'deleted');

-- CreateTable
CREATE TABLE "price_rules" (
    "id" SERIAL NOT NULL,
    "cabin_id" INTEGER NOT NULL,
    "type" "price_rule_type" NOT NULL,
    "kind" "price_rule_kind" NOT NULL,
    "percent" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "weekdays" INTEGER[],
    "label" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" INTEGER NOT NULL,
    "updated_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rule_audits" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "cabin_id" INTEGER NOT NULL,
    "action" "price_rule_audit_action" NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_rule_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabin_daily_prices" (
    "cabin_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "base_price" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "surcharge_percent" INTEGER NOT NULL,
    "final_price" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabin_daily_prices_pkey" PRIMARY KEY ("cabin_id","date")
);

-- CreateTable
CREATE TABLE "booking_nights" (
    "booking_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "base_price" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "surcharge_percent" INTEGER NOT NULL,
    "final_price" INTEGER NOT NULL,
    "applied_rules" JSONB NOT NULL,

    CONSTRAINT "booking_nights_pkey" PRIMARY KEY ("booking_id","date")
);

-- CreateIndex
CREATE INDEX "price_rules_cabin_id_is_active_idx" ON "price_rules"("cabin_id", "is_active");

-- CreateIndex
CREATE INDEX "price_rule_audits_rule_id_idx" ON "price_rule_audits"("rule_id");

-- CreateIndex
CREATE INDEX "price_rule_audits_cabin_id_idx" ON "price_rule_audits"("cabin_id");

-- CreateIndex
CREATE INDEX "cabin_daily_prices_date_idx" ON "cabin_daily_prices"("date");

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_cabin_id_fkey" FOREIGN KEY ("cabin_id") REFERENCES "cabins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rule_audits" ADD CONSTRAINT "price_rule_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_daily_prices" ADD CONSTRAINT "cabin_daily_prices_cabin_id_fkey" FOREIGN KEY ("cabin_id") REFERENCES "cabins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Legacy backfill #1: snapshot BookingNight rows for existing bookings.
--
-- The OLD `cabin_price` was the nightly price (total = cabin_price * num_nights),
-- so it is used as base = final price for each night (percentages 0).
-- ============================================================================
INSERT INTO "booking_nights" (
    "booking_id",
    "date",
    "base_price",
    "discount_percent",
    "surcharge_percent",
    "final_price",
    "applied_rules"
)
SELECT
    b."id",
    (b."start_date" + (g.n || ' days')::interval)::date,
    b."cabin_price",
    0,
    0,
    b."cabin_price",
    '[]'::jsonb
FROM "bookings" AS b
CROSS JOIN LATERAL generate_series(0, b."num_nights" - 1) AS g(n);

-- ============================================================================
-- Legacy backfill #2: `cabin_price` now means the accommodation SUBTOTAL
-- (sum of BookingNight.finalPrice). Convert legacy rows only where the old
-- invariant `total_price = cabin_price * num_nights` actually held.
-- ============================================================================
UPDATE "bookings"
SET "cabin_price" = "cabin_price" * "num_nights"
WHERE "total_price" = "cabin_price" * "num_nights";

-- ============================================================================
-- Legacy backfill #3: bring existing `regular_price` rows into the valid range
-- [1_000_000, 35_000_000] (dev/seed data) so the app is consistent afterwards.
-- ============================================================================
UPDATE "cabins" SET "regular_price" = 1000000 WHERE "regular_price" < 1000000;
UPDATE "cabins" SET "regular_price" = 35000000 WHERE "regular_price" > 35000000;

-- ============================================================================
-- AlterTable: remove Cabin.discount — discounts now live only in price_rules.
-- ============================================================================
ALTER TABLE "cabins" DROP COLUMN "discount";

-- ============================================================================
-- CHECK constraints (data SHAPE only).
--
-- The configurable limits (max count / max percent / regularPrice bounds) are
-- intentionally NOT enforced here, because they will move to the Setting table.
-- ============================================================================
ALTER TABLE "price_rules"
    ADD CONSTRAINT "price_rules_percent_range" CHECK ("percent" BETWEEN 1 AND 100);

ALTER TABLE "price_rules"
    ADD CONSTRAINT "price_rules_kind_config" CHECK (
        (
            "kind" = 'date_range'
            AND "start_date" IS NOT NULL
            AND "end_date" IS NOT NULL
            AND "start_date" <= "end_date"
            AND cardinality("weekdays") = 0
        )
        OR (
            "kind" = 'weekday'
            AND "start_date" IS NULL
            AND "end_date" IS NULL
            AND cardinality("weekdays") >= 1
        )
    );

-- Helper: weekdays must be a subset of {1..7} with no duplicates.
-- A subquery cannot appear directly in a CHECK, so it lives in an IMMUTABLE fn.
CREATE OR REPLACE FUNCTION price_rule_weekdays_valid(days integer[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT days <@ ARRAY[1,2,3,4,5,6,7]::integer[]
       AND cardinality(days) = (SELECT count(DISTINCT d) FROM unnest(days) AS d);
$$;

ALTER TABLE "price_rules"
    ADD CONSTRAINT "price_rules_weekdays_valid" CHECK (price_rule_weekdays_valid("weekdays"));

-- ============================================================================
-- Schema remarks: missing FK indexes, column-length alignment and enum label
-- cleanup. This migration does NOT modify data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Missing FK indexes.
-- ----------------------------------------------------------------------------
CREATE INDEX "cabins_city_id_idx" ON "cabins"("city_id");
CREATE INDEX "bookings_guest_id_idx" ON "bookings"("guest_id");
CREATE INDEX "cabin_categories_category_id_idx" ON "cabin_categories"("category_id");
CREATE INDEX "price_rules_created_by_id_idx" ON "price_rules"("created_by_id");
CREATE INDEX "price_rules_updated_by_id_idx" ON "price_rules"("updated_by_id");
CREATE INDEX "price_rule_audits_actor_id_idx" ON "price_rule_audits"("actor_id");

-- ----------------------------------------------------------------------------
-- Length alignment: `users.email` now matches `verification_codes.email` (254),
-- and `cabins.name` gets an explicit length (matching the app validation).
-- ----------------------------------------------------------------------------
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE VARCHAR(254);
ALTER TABLE "cabins" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- ----------------------------------------------------------------------------
-- Enum labels -> snake_case. Renamed in place (no drop/recreate, no data loss).
-- The `bookings_no_overlap` exclusion constraint references these labels and is
-- updated automatically by the rename (enum values keep their OID).
-- ----------------------------------------------------------------------------
ALTER TYPE "booking_status" RENAME VALUE 'checked-in' TO 'checked_in';
ALTER TYPE "booking_status" RENAME VALUE 'checked-out' TO 'checked_out';

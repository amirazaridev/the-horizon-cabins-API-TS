/*
  Warnings:

  - You are about to alter the column `total_price` on the `bookings` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - Made the column `payment_deadline` on table `bookings` required. This step will fail if there are existing NULL values in that column.

*/

UPDATE "bookings"
SET "payment_deadline" = "created_at" + interval '30 minutes'
WHERE "payment_deadline" IS NULL;
-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "start_date" SET DATA TYPE DATE,
ALTER COLUMN "end_date" SET DATA TYPE DATE,
ALTER COLUMN "total_price" SET DATA TYPE INTEGER,
ALTER COLUMN "payment_deadline" SET NOT NULL;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_dates_valid" CHECK ("end_date" > "start_date");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "cabin_id" WITH =,
    daterange("start_date", "end_date") WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'checked-in'));
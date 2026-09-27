/*
  Warnings:

  - You are about to drop the column `extras_price` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `is_paid` on the `bookings` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "cancellation_reason" AS ENUM ('payment_expired', 'user_cancelled', 'admin_cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "booking_status" ADD VALUE 'pending';
ALTER TYPE "booking_status" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "extras_price",
DROP COLUMN "is_paid",
ADD COLUMN     "cancellation_reason" "cancellation_reason",
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_deadline" TIMESTAMP(3),
ADD COLUMN     "payment_reference" TEXT,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "bookings_cabin_id_start_date_end_date_idx" ON "bookings"("cabin_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "bookings_status_payment_deadline_idx" ON "bookings"("status", "payment_deadline");

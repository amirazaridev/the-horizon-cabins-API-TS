-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('signup', 'passwordReset', 'login');

-- CreateEnum
CREATE TYPE "otp_status" AS ENUM ('pending', 'consumed', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "purpose" "otp_purpose" NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "status" "otp_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "verification_token_hash" VARCHAR(255),
    "verification_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_codes_verification_token_hash_key" ON "verification_codes"("verification_token_hash");

-- CreateIndex
CREATE INDEX "verification_codes_email_purpose_status_idx" ON "verification_codes"("email", "purpose", "status");

-- CreateIndex
CREATE INDEX "verification_codes_expires_at_idx" ON "verification_codes"("expires_at");

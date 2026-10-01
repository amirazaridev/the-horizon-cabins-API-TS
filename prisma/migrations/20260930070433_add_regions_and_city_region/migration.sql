-- =============================================================
-- Add Region model and link City -> Region (1:N)
-- =============================================================
-- The `region_id` column is NOT NULL, but the `cities` table already
-- contains rows. Prisma cannot generate this migration on its own, so the
-- column is added as NULLABLE, backfilled, and only then made NOT NULL.

-- CreateTable
CREATE TABLE "regions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_slug_key" ON "regions"("slug");

-- Seed the static regions so the backfill below has a valid target.
-- Explicit ids keep the seed files able to reference regions deterministically.
-- Idempotent: safe to re-run against a database where regions already exist.
INSERT INTO "regions" ("id", "name", "slug", "display_order", "created_at", "updated_at")
VALUES
    (1, 'شمال',        'north',     1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (2, 'شمال شرقی',   'northeast', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (3, 'شمال غربی',   'northwest', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (4, 'مرکزی',       'central',   4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (5, 'غرب',         'west',      5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (6, 'شرق',         'east',      6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (7, 'جنوب',        'south',     7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (8, 'جنوب شرقی',   'southeast', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Keep the SERIAL sequence in sync with the explicit ids inserted above,
-- otherwise the next autoincrement insert would collide on id = 1.
SELECT setval(
    pg_get_serial_sequence('regions', 'id'),
    COALESCE((SELECT MAX("id") FROM "regions"), 1)
);

-- AlterTable: step 1 - add as nullable so existing rows survive
ALTER TABLE "cities" ADD COLUMN "region_id" INTEGER;

-- Backfill: every pre-existing city is on the Caspian coast, i.e. the North region.
UPDATE "cities"
SET "region_id" = (SELECT "id" FROM "regions" WHERE "slug" = 'north')
WHERE "region_id" IS NULL;

-- AlterTable: step 2 - now that every row has a value, enforce NOT NULL
ALTER TABLE "cities" ALTER COLUMN "region_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "cities_region_id_idx" ON "cities"("region_id");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

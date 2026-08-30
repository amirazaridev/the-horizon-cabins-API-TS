-- CreateTable
CREATE TABLE "cabins" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "max_capacity" INTEGER NOT NULL,
    "regular_price" BIGINT NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "amenities" TEXT[],
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "area_sqm" DOUBLE PRECISION NOT NULL,
    "images" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cabins_name_key" ON "cabins"("name");

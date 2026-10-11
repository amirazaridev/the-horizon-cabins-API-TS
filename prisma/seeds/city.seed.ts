import { cities } from "./data/city";
import { cabins } from "./data/cabin";
import { prisma } from "../../src/config/database";

/**
 * استخر عکس‌های دمو برای شهرها.
 *
 * ⚠️ موقتی (فقط برای دمو): چون هنوز عکس اختصاصی هر شهر وجود ندارد، عکس شاخص
 * کابین‌های seed را برمی‌داریم و به‌صورت چرخشی به شهرها نسبت می‌دهیم. با
 * اضافه‌شدن عکس‌های واقعی شهر، این تابع باید حذف شود.
 */
const CITY_IMAGE_POOL = cabins
  .map((cabin) => cabin.images[0])
  .filter((url): url is string => Boolean(url));

function demoImageForCity(index: number): string | null {
  if (CITY_IMAGE_POOL.length === 0) return null;
  return CITY_IMAGE_POOL[index % CITY_IMAGE_POOL.length] ?? null;
}

export async function seedCities() {
  const upsertPromises = cities.map((city, index) =>
    prisma.city.upsert({
      where: { name: city.name },
      // Re-align the region and demo image on every run so pre-existing
      // cities also get their image assigned.
      update: { regionId: city.regionId, imageUrl: demoImageForCity(index) },
      create: { ...city, imageUrl: demoImageForCity(index) },
    }),
  );

  await Promise.all(upsertPromises);
}

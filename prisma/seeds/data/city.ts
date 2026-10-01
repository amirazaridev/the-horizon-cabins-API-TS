import { City } from "../../../src/generated/prisma/client";

/**
 * Iranian cities grouped by region.
 * `regionId` maps to `prisma/seeds/data/region.ts`:
 *   1 = شمال | 2 = شمال شرقی | 3 = شمال غربی | 4 = مرکزی
 *   5 = غرب | 6 = شرق       | 7 = جنوب      | 8 = جنوب شرقی
 */
export const cities: City[] = [
  // -------------------------------------
  // شمال (north) — Caspian coast
  // -------------------------------------
  {
    id: 1,
    name: "نوشهر",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 2,
    name: "رامسر",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 3,
    name: "کلاردشت",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 4,
    name: "ماسال",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 5,
    name: "محمودآباد",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 6,
    name: "نور",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 7,
    name: "چالوس",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 8,
    name: "بابلسر",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 9,
    name: "سیاهکل",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 10,
    name: "رشت",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 11,
    name: "لاهیجان",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 12,
    name: "بندر انزلی",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 13,
    name: "ساری",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 14,
    name: "گرگان",
    regionId: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // شمال شرقی (northeast) — Khorasan & eastern Alborz
  // -------------------------------------
  {
    id: 15,
    name: "مشهد",
    regionId: 2,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 16,
    name: "نیشابور",
    regionId: 2,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 17,
    name: "بجنورد",
    regionId: 2,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 18,
    name: "شاهرود",
    regionId: 2,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // شمال غربی (northwest) — Azerbaijan, Ardabil, Zanjan
  // -------------------------------------
  {
    id: 19,
    name: "تبریز",
    regionId: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 20,
    name: "ارومیه",
    regionId: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 21,
    name: "اردبیل",
    regionId: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 22,
    name: "زنجان",
    regionId: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 23,
    name: "سراب",
    regionId: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 24,
    name: "خلخال",
    regionId: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // مرکزی (central) — Tehran, Isfahan, Yazd, Qom
  // -------------------------------------
  {
    id: 25,
    name: "تهران",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 26,
    name: "اصفهان",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 27,
    name: "یزد",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 28,
    name: "قم",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 29,
    name: "کرج",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 30,
    name: "کاشان",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 31,
    name: "اراک",
    regionId: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // غرب (west) — Kermanshah, Kurdistan, Hamadan, Lorestan, Ilam
  // -------------------------------------
  {
    id: 32,
    name: "کرمانشاه",
    regionId: 5,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 33,
    name: "همدان",
    regionId: 5,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 34,
    name: "سنندج",
    regionId: 5,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 35,
    name: "خرم‌آباد",
    regionId: 5,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 36,
    name: "ایلام",
    regionId: 5,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // شرق (east) — South Khorasan & Semnan
  // -------------------------------------
  {
    id: 37,
    name: "بیرجند",
    regionId: 6,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 38,
    name: "طبس",
    regionId: 6,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 39,
    name: "قائن",
    regionId: 6,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 40,
    name: "فردوس",
    regionId: 6,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // جنوب (south) — Persian Gulf coast & islands
  // -------------------------------------
  {
    id: 41,
    name: "کیش",
    regionId: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 42,
    name: "قشم",
    regionId: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 43,
    name: "بندرعباس",
    regionId: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 44,
    name: "بوشهر",
    regionId: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 45,
    name: "بندر لنگه",
    regionId: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 46,
    name: "بندر ماهشهر",
    regionId: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },

  // -------------------------------------
  // جنوب شرقی (southeast) — Sistan & Baluchestan, Kerman
  // -------------------------------------
  {
    id: 47,
    name: "زاهدان",
    regionId: 8,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 48,
    name: "کرمان",
    regionId: 8,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 49,
    name: "بم",
    regionId: 8,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 50,
    name: "چابهار",
    regionId: 8,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 51,
    name: "ایرانشهر",
    regionId: 8,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
];

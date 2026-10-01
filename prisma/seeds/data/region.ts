import { Region } from "../../../src/generated/prisma/client";

/**
 * Regions are static reference data.
 * Ids are explicit so the city seed can reference them deterministically.
 */
export const regions: Region[] = [
  {
    id: 1,
    name: "شمال",
    slug: "north",
    displayOrder: 1,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 2,
    name: "شمال شرقی",
    slug: "northeast",
    displayOrder: 2,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 3,
    name: "شمال غربی",
    slug: "northwest",
    displayOrder: 3,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 4,
    name: "مرکزی",
    slug: "central",
    displayOrder: 4,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 5,
    name: "غرب",
    slug: "west",
    displayOrder: 5,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 6,
    name: "شرق",
    slug: "east",
    displayOrder: 6,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 7,
    name: "جنوب",
    slug: "south",
    displayOrder: 7,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
  {
    id: 8,
    name: "جنوب شرقی",
    slug: "southeast",
    displayOrder: 8,
    createdAt: new Date("2025-03-12T08:30:00.000Z"),
    updatedAt: new Date("2025-03-12T08:30:00.000Z"),
  },
];

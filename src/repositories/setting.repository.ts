// import { prisma } from '../config/database.js';

// const DEFAULT_SETTINGS = {
//   minBookingLength: 1,
//   maxBookingLength: 30,
//   maxGuests: 10,
//   breakfastPrice: 15, // یادت باشه این عدد رو با 150000 (تو getSingleton قدیمی) چک کنی
// };

// export async function getSettings() {
//   const settings = await prisma.setting.findFirst();
//   if (settings) return settings;
//   return prisma.setting.create({ data: DEFAULT_SETTINGS });
// }
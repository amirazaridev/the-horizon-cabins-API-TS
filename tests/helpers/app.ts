import createApp from "../../src/app.js";
import type { Express } from "express";

/**
 * یک نمونه‌ی app برای supertest.
 * `createApp` جدا از `listen` است، پس می‌توان بدون باز کردن پورت واقعی تست کرد.
 */
let app: Express | null = null;

export function getTestApp(): Express {
  if (!app) {
    app = createApp();
  }
  return app;
}

/** مسیر پایه‌ی API (هم‌راستا با routes/index.ts). */
export const API_BASE = "/api/v1";
export const BOOKINGS_PATH = `${API_BASE}/bookings`;

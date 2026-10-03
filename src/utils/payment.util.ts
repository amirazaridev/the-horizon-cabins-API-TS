import { randomUUID } from "crypto";

export function simulatePaymentGateway(): string {
  return randomUUID();
}
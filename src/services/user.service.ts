import env from "../config/env.js";
import * as userRepository from "../repositories/user.repository.js";
import { SafeUser } from "../types/user.types.js";

export async function incrementLoginAttempts(userId: number): Promise<void> {
  await userRepository.incrementLoginAttemptsWithLock(
    userId,
    env.MAX_LOGIN_ATTEMPTS,
    env.LOCK_DURATION_MS,
  );
}

export async function resetLoginAttempts(userId: number): Promise<void> {
  await userRepository.resetLoginAttempts(userId);
}

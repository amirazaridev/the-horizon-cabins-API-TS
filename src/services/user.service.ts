import env from "../config/env.js";
import * as userRepository from "../repositories/user.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
import { SafeUser } from "../types/user.types.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { UpdateProfileInput } from "../validations/user.validation.js";

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
export async function getUserProfile(user: SafeUser) {
  const guest = await guestRepository.findGuestByUserId(user.id);
  const customUser = user.role === "guest" ? { ...user, role: undefined } : user;
  return { user: customUser, guest };
}

/**
 * ویرایش پروفایل کاربر جاری (`PATCH /user/me`).
 *
 * ⚠️ فقط فیلدهای پروفایل مهمان به‌روزرسانی می‌شوند و ایمیل/نقش دست‌نخورده
 * می‌ماند. اگر کاربر پروفایل مهمان نداشته باشد (مثلاً admin/owner) با ۴۰۳
 * رد می‌شود — همان رفتاری که `createBooking` برای نبود Guest دارد.
 *
 * ⚠️ فقط کلیدهای `!== undefined` وارد `data` می‌شوند تا یک PATCH جزئی بقیه‌ی
 * فیلدها را پاک نکند (نگاه کنید به قرارداد اعتبارسنجی در user.validation).
 *
 * @returns همان شکل `GET /user/me` تا مصرف‌کننده بتواند خروجی را یکسان بخواند.
 */
export async function updateUserProfile(user: SafeUser, input: UpdateProfileInput) {
  const guest = await guestRepository.findGuestByUserId(user.id);
  if (!guest) {
    throw new AppError("Guest profile not found", HTTP_STATUS.FORBIDDEN, ErrorCode.FORBIDDEN);
  }

  const data: Prisma.GuestUpdateInput = { fullName: input.fullName };
  if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
  if (input.nationalId !== undefined) data.nationalId = input.nationalId;
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;
  if (input.gender !== undefined) data.gender = input.gender;

  await guestRepository.updateGuestByUserId(user.id, data);

  return getUserProfile(user);
}

import env from "../config/env.js";
import * as userRepository from "../repositories/user.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
import { SafeUser, type AdminUser, type UserFilters } from "../types/user.types.js";
import { AppError } from "../utils/AppError.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { getPaginationMeta } from "../utils/pagination.utils.js";
import type { PaginatedResult, PaginationParams } from "../types/pagination.types.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { UserRole } from "../generated/prisma/enums.js";
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

/* ==========================================================================
   پنل مدیریت کاربران
   ========================================================================== */

/**
 * لیست کاربران مهمان برای پنل مدیریت (صفحه‌بندی‌شده).
 *
 * ⚠️ دامنه به نقش `guest` محدود است؛ همین لایه هم شمارش و هم داده را از
 * repository می‌گیرد تا `meta` با فیلترها هم‌خوان بماند.
 */
export async function getUsers(
  params: PaginationParams & { filters: UserFilters },
): Promise<PaginatedResult<AdminUser>> {
  const { skip, limit, page, filters } = params;

  const { data, total } = await userRepository.findAllGuests({ skip, limit, filters });
  return { data, meta: getPaginationMeta(total, page, limit) };
}

/** فعال/غیرفعال‌کردن حساب یک کاربر مهمان. */
export async function setUserStatus(id: number, active: boolean): Promise<AdminUser> {
  await assertGuestExists(id);
  return userRepository.updateUserStatus(id, active);
}

/** تغییر نقش یک کاربر مهمان (مثلاً ارتقا به مدیر). */
export async function setUserRole(id: number, role: UserRole): Promise<AdminUser> {
  await assertGuestExists(id);
  return userRepository.updateUserRole(id, role);
}

/**
 * اطمینان از وجود کاربرِ مهمان با این شناسه.
 *
 * ⚠️ 404 (نه 403) می‌دهیم چون «کاربر مهمانی با این شناسه در دامنه‌ی این
 * صفحه وجود ندارد» — نه اینکه کاربر مجاز نباشد.
 */
async function assertGuestExists(id: number): Promise<void> {
  const user = await userRepository.findGuestById(id);
  if (!user) {
    throw new AppError("Guest not found", HTTP_STATUS.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
}

import env from "../config/env.js";
import * as userRepository from "../repositories/user.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
import {
  SafeUser,
  type AdminUser,
  type UserActor,
  type UserFilters,
} from "../types/user.types.js";
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

/** سقف تعداد مالکان — سیاست محصول. */
const MAX_OWNERS = 2;

/**
 * لیست کاربران برای پنل مدیریت (صفحه‌بندی‌شده).
 *
 * دامنه با `filters.roles` تعیین می‌شود: صفحه‌ی «افراد و مهمانان» فقط
 * `guest` و صفحه‌ی «مدیران» مقدار `admin|owner` می‌فرستد.
 *
 * ⚠️ `admin` فقط اجازه‌ی دیدن دامنه‌ی مهمان‌ها را دارد؛ لیست مدیران/مالکان
 * انحصاری `owner` است (هم‌راستا با «صفحه‌ی مدیران برای admin وجود ندارد»).
 */
export async function getUsers(
  params: PaginationParams & { filters: UserFilters; actor: UserActor },
): Promise<PaginatedResult<AdminUser>> {
  const { skip, limit, page, filters, actor } = params;

  assertCanListRoles(actor, filters.roles);

  const { data, total } = await userRepository.findManyUsers({ skip, limit, filters });
  return { data, meta: getPaginationMeta(total, page, limit) };
}

/**
 * فعال/غیرفعال‌کردن حساب کاربر.
 *
 * سیاست:
 * - `owner` هرگز غیرفعال نمی‌شود (مالکان نمی‌توانند همدیگر را تغییر دهند و
 *   هیچ‌کس هم نباید آخرین مالک را از کار بیندازد).
 * - `admin` فقط روی حساب مهمان‌ها اختیار دارد؛ روی admin/owner دسترسی ندارد.
 * - `owner` روی مهمان و admin آزاد است.
 */
export async function setUserStatus(
  id: number,
  active: boolean,
  actor: UserActor,
): Promise<AdminUser> {
  const target = await getUserOrThrow(id);
  assertCanManageStatus(actor, target);

  return userRepository.updateUserStatus(id, active);
}

/**
 * تغییر نقش کاربر.
 *
 * سیاست:
 * - نقش هیچ `owner`ی قابل تغییر نیست (نه توسط مالک دیگر، نه خودش).
 * - ارتقا به `owner` فقط تا سقف دو مالک مجاز است.
 * - بقیه‌ی تغییرها برای `owner` آزاد است (کنترل دسترسی route: فقط owner).
 */
export async function setUserRole(
  id: number,
  role: UserRole,
  actor: UserActor,
): Promise<AdminUser> {
  const target = await getUserOrThrow(id);
  assertCanChangeRole(actor, target);

  if (role === "owner" && target.role !== "owner") {
    await assertOwnerLimit();
  }

  return userRepository.updateUserRole(id, role);
}

/**
 * حذف کامل کاربر.
 *
 * سیاست:
 * - کنترل دسترسی route: فقط `owner` (پس admin هرگز به این مسیر نمی‌رسد و
 *   به‌تبع آن نمی‌تواند owner را حذف کند).
 * - هیچ `owner`ی حذف نمی‌شود (شامل خودِ حذف‌کننده).
 * - کاربری که رزرو یا قاعده‌ی قیمت دارد حذف نمی‌شود (FK `Restrict`) — به‌جای
 *   حذف باید غیرفعال شود.
 */
export async function deleteUser(id: number, actor: UserActor): Promise<void> {
  const target = await getUserOrThrow(id);
  assertCanDelete(target, actor);

  const dependencies = await userRepository.countUserDependencies(id);
  if (dependencies.bookings > 0 || dependencies.priceRules > 0) {
    throw new AppError(
      "This user has bookings or price rules and cannot be deleted; deactivate the account instead",
      HTTP_STATUS.CONFLICT,
      ErrorCode.USER_HAS_DEPENDENCIES,
    );
  }

  await userRepository.deleteUserById(id);
}

/* ---------------------------------------------------------------- گاردها */

async function getUserOrThrow(id: number): Promise<AdminUser> {
  const user = await userRepository.findManagedUserById(id);
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
  return user;
}

/** دامنه‌ی لیست: admin فقط مهمان‌ها؛ لیست مدیران/مالکان انحصاری owner. */
function assertCanListRoles(actor: UserActor, roles: UserRole[] | undefined): void {
  if (actor.role === "owner") return;

  const requested = roles && roles.length > 0 ? roles : (["guest"] as const);
  const guestsOnly = requested.every((role) => role === "guest");

  if (!guestsOnly) {
    throw new AppError(
      "Admins can only list guest accounts",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }
}

/** حساب مالکان در برابر تغییر وضعیت محافظت می‌شود؛ admin فقط مهمان‌ها. */
function assertCanManageStatus(actor: UserActor, target: AdminUser): void {  if (target.role === "owner") {
    throw new AppError(
      "Owner accounts cannot be modified",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }

  if (actor.role === "admin" && target.role !== "guest") {
    throw new AppError(
      "Admins can only manage guest accounts",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }
}

/** تغییر نقش فقط برای مالک مجاز است؛ نقش مالکان هرگز تغییر نمی‌کند. */
function assertCanChangeRole(actor: UserActor, target: AdminUser): void {
  //* دفاع در عمق — روت هم با `restrictTo("owner")` محدود شده است.
  if (actor.role !== "owner") {
    throw new AppError(
      "Only owners can change roles",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }

  if (target.role === "owner") {
    throw new AppError(
      "Owner roles cannot be changed",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }
}

/** حذف فقط برای مالک مجاز است و هیچ مالکی حذف نمی‌شود (شامل خودِ حذف‌کننده). */
function assertCanDelete(target: AdminUser, actor: UserActor): void {
  //* دفاع در عمق — روت هم با `restrictTo("owner")` محدود شده است.
  if (actor.role !== "owner") {
    throw new AppError(
      "Only owners can delete users",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }

  if (target.role === "owner" || target.id === actor.id) {
    throw new AppError(
      "Owner accounts cannot be deleted",
      HTTP_STATUS.FORBIDDEN,
      ErrorCode.FORBIDDEN,
    );
  }
}

/** سقف دو مالک. */
async function assertOwnerLimit(): Promise<void> {
  const owners = await userRepository.countOwners();
  if (owners >= MAX_OWNERS) {
    throw new AppError(
      `At most ${MAX_OWNERS} owners are allowed`,
      HTTP_STATUS.CONFLICT,
      ErrorCode.OWNER_LIMIT_REACHED,
    );
  }
}

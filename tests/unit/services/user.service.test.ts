import { describe, it, expect, vi, beforeEach } from "vitest";
import * as userService from "../../../src/services/user.service.js";
import * as guestRepository from "../../../src/repositories/guest.repository.js";
import { ErrorCode } from "../../../src/constants/errorCodes.js";
import { HTTP_STATUS } from "../../../src/constants/httpStatus.js";

// repositoryها mock می‌شوند؛ تست‌های unit نباید به دیتابیس بزنند.
vi.mock("../../../src/repositories/guest.repository.js");
vi.mock("../../../src/repositories/user.repository.js");

const USER_ID = 1;

/** کاربر جاری (نقش guest). */
const USER = {
  id: USER_ID,
  email: "guest@test.local",
  role: "guest",
  active: true,
  password: "hashed",
} as never;

/** ردیف پروفایل مهمان. */
const GUEST_ROW = {
  id: 10,
  userId: USER_ID,
  fullName: "Old Name",
  phoneNumber: null,
  nationalId: null,
  dateOfBirth: null,
  gender: null,
};

describe("user.service — updateUserProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(GUEST_ROW as never);
    vi.mocked(guestRepository.updateGuestByUserId).mockResolvedValue(GUEST_ROW as never);
  });

  it("should throw 403 when the caller has no guest profile", async () => {
    vi.mocked(guestRepository.findGuestByUserId).mockResolvedValue(null);

    await expect(userService.updateUserProfile(USER, { fullName: "New Name" })).rejects.toMatchObject(
      { statusCode: HTTP_STATUS.FORBIDDEN, code: ErrorCode.FORBIDDEN },
    );
    expect(guestRepository.updateGuestByUserId).not.toHaveBeenCalled();
  });

  it("should update only the provided fields (partial PATCH keeps the rest untouched)", async () => {
    await userService.updateUserProfile(USER, { fullName: "New Name" });

    expect(guestRepository.updateGuestByUserId).toHaveBeenCalledTimes(1);
    expect(guestRepository.updateGuestByUserId).toHaveBeenCalledWith(USER_ID, {
      fullName: "New Name",
    });
  });

  it("should forward null values so a field can be cleared", async () => {
    await userService.updateUserProfile(USER, {
      fullName: "New Name",
      phoneNumber: null,
      nationalId: null,
      dateOfBirth: null,
    });

    expect(guestRepository.updateGuestByUserId).toHaveBeenCalledWith(USER_ID, {
      fullName: "New Name",
      phoneNumber: null,
      nationalId: null,
      dateOfBirth: null,
    });
  });

  it("should forward a Date and gender when provided", async () => {
    const dateOfBirth = new Date("1991-08-03T00:00:00.000Z");

    await userService.updateUserProfile(USER, {
      fullName: "New Name",
      dateOfBirth,
      gender: "female",
    });

    expect(guestRepository.updateGuestByUserId).toHaveBeenCalledWith(USER_ID, {
      fullName: "New Name",
      dateOfBirth,
      gender: "female",
    });
  });

  it("should return the same shape as GET /user/me (role stripped for guests)", async () => {
    const result = await userService.updateUserProfile(USER, { fullName: "New Name" });

    expect(result.guest).toEqual(GUEST_ROW);
    expect(result.user).toMatchObject({ id: USER_ID, email: "guest@test.local" });
    expect(result.user.role).toBeUndefined();
  });
});

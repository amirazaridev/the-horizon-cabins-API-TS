import { AppError } from "../utils/AppError.js";
import { signToken } from "../utils/jwt.utils.js";
import { comparePassword, isPasswordChangedAfter } from "../utils/password.utils.js";
import * as userRepository from "../repositories/user.repository.js";
import * as guestRepository from "../repositories/guest.repository.js";
import * as userService from "./user.service.js";
import { HTTP_STATUS } from "../constants/httpStatus.js";
import { ErrorCode } from "../constants/errorCodes.js";
import { SafeUser } from "../types/user.types.js";
import z from "zod";
import { signupSchema } from "../validations/auth.validation.js";

type SignupInput = z.infer<typeof signupSchema.body>;

export async function login(
  email: string,
  password: string,
): Promise<{ user: SafeUser; token: string }> {
  const user = await userRepository.findUserByEmail(email);

  if (!user)
    throw new AppError(
      "Incorrect email or password",
      HTTP_STATUS.UNAUTHORIZED,
      ErrorCode.UNAUTHORIZED,
    );

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("Account is locked. Please try again later.", HTTP_STATUS.FORBIDDEN);
  }

  const { password: pw, ...safeUser } = user;

  const isPasswordValid = await comparePassword(password, pw);

  if (!isPasswordValid) {
    await userService.incrementLoginAttempts(user.id);
    throw new AppError(
      "Incorrect email or password",
      HTTP_STATUS.UNAUTHORIZED,
      ErrorCode.UNAUTHORIZED,
    );
  }

  await userService.resetLoginAttempts(user.id);

  const token = signToken(user.id);

  return { user: safeUser, token };
}

export async function signup(input: SignupInput): Promise<{ user: SafeUser; token: string }> {
  const { fullName, ...userData } = input;

  const user = await userRepository.createUser(userData);

  await guestRepository.createGuest({ fullName, userId: user.id });

  const token = signToken(user.id);
  return { user, token };
}

export async function verifyUserFromToken(
  userId: number,
  tokenIssuedAt: number,
): Promise<SafeUser> {
  const currentUser = await userRepository.findUserById(userId);

  if (!currentUser) {
    throw new AppError(
      "The user belonging to this token does no longer exist. Please log in again",
      401,
    );
  }

  if (isPasswordChangedAfter(currentUser.lastPasswordChange, tokenIssuedAt)) {
    throw new AppError("User recently changed password! Please log in again.", 401);
  }

  return currentUser;
}

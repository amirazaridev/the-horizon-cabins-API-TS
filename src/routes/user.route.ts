import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { paginationMiddleware } from "../middlewares/pagination.middleware.js";
import * as userValidation from "../validations/user.validation.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

router.use(protect);

router
  .route("/me")
  .get(userController.getMe)
  .patch(validate(userValidation.updateProfileSchema), userController.updateMe);

//? لیست کاربران مهمان (صفحه‌بندی‌شده) — فقط admin|owner.
router.get(
  "/",
  restrictTo(...BOOKING_ADMIN_ROLES),
  validate(userValidation.listUsersQueryValidation),
  paginationMiddleware,
  userController.getAll,
);

//? فعال/غیرفعال‌کردن حساب — admin|owner.
router.patch(
  "/:id/status",
  restrictTo(...BOOKING_ADMIN_ROLES),
  validate(userValidation.updateUserStatusSchema),
  userController.updateStatus,
);

//? تغییر نقش — حساس؛ فقط owner (هم‌راستا با قاعده‌ی مدیریت مدیران).
router.patch(
  "/:id/role",
  restrictTo("owner"),
  validate(userValidation.updateUserRoleSchema),
  userController.updateRole,
);

export default router;

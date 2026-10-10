import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { dashboardSnapshotValidation } from "../validations/dashboard.validation.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

//? داده‌ی داشبورد مدیریتی — فقط admin|owner.
router.use(protect, restrictTo(...BOOKING_ADMIN_ROLES));

router.get(
  "/snapshot",
  validate(dashboardSnapshotValidation),
  dashboardController.getSnapshot,
);

export default router;

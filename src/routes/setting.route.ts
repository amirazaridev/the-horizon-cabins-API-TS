import { Router } from "express";
import * as settingController from "../controllers/setting.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { updateSettingsSchema } from "../validations/setting.validation.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

router.use(protect);

//? خواندن تنظیمات برای admin|owner؛ ویرایش فقط برای owner.
router.get("/", restrictTo(...BOOKING_ADMIN_ROLES), settingController.getSettings);
router.patch(
  "/",
  restrictTo("owner"),
  validate(updateSettingsSchema),
  settingController.updateSettings,
);

export default router;

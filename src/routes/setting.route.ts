import { Router } from "express";
import * as settingController from "../controllers/setting.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { updateSettingsSchema } from "../validations/setting.validation.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

//? خواندن و ویرایش تنظیمات فقط برای admin|owner.
router.use(protect, restrictTo(...BOOKING_ADMIN_ROLES));

router
  .route("/")
  .get(settingController.getSettings)
  .patch(validate(updateSettingsSchema), settingController.updateSettings);

export default router;

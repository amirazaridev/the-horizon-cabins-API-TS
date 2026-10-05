import { Router } from "express";
import * as priceCalendarController from "../controllers/price-calendar.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { rebuildCalendarSchema } from "../validations/price-calendar.validation.js";

const router = Router();

router.use(protect);

//? owner only — rebuild دستی تقویم قیمت (یک کابین یا همه).
router.post(
  "/rebuild",
  restrictTo("owner"),
  validate(rebuildCalendarSchema),
  priceCalendarController.rebuild,
);

export default router;

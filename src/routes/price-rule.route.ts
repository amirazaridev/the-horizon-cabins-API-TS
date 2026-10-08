import { Router } from "express";
import * as priceRuleController from "../controllers/price-rule.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as priceRuleValidation from "../validations/price-rule.validation.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

router.use(protect);

//? owner only — bulk ساخت قاعده برای چند/همه‌ی کابین‌ها (atomic).
router.post(
  "/bulk",
  restrictTo("owner"),
  validate(priceRuleValidation.bulkCreatePriceRulesSchema),
  priceRuleController.bulkCreate,
);

router.get(
  "/:id/history",
  restrictTo(...BOOKING_ADMIN_ROLES),
  validate(priceRuleValidation.priceRuleIdSchema),
  priceRuleController.history,
);

router
  .route("/:id")
  .patch(
    restrictTo(...BOOKING_ADMIN_ROLES),
    validate(priceRuleValidation.updatePriceRuleSchema),
    priceRuleController.update,
  )
  .delete(
    restrictTo("owner"),
    validate(priceRuleValidation.priceRuleIdSchema),
    priceRuleController.remove,
  );

export default router;

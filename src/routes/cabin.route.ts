import { Router } from "express";
import * as cabinController from "../controllers/cabin.controller.js";
import * as priceRuleController from "../controllers/price-rule.controller.js";
import * as priceCalendarController from "../controllers/price-calendar.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import * as cabinValidation from "../validations/cabin.validation.js";
import * as categoryValidation from "../validations/category.validation.js";
import * as priceRuleValidation from "../validations/price-rule.validation.js";
import * as priceCalendarValidation from "../validations/price-calendar.validation.js";
import { paginationMiddleware } from "../middlewares/pagination.middleware.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

router
  .route("/")
  .get(
    validate(cabinValidation.listCabinsQueryValidation),
    paginationMiddleware,
    cabinController.getAll,
  )
  .post(cabinController.createCabin);
router.route("/amenities").get(cabinController.getAllAmenities);

//? تقویم قیمت یک کابین (عمومی).
router.get(
  "/:cabinId/price-calendar",
  validate(priceCalendarValidation.cabinPriceCalendarSchema),
  priceCalendarController.getCabinCalendar,
);

//? قواعد قیمت‌گذاری یک کابین — فقط admin|owner.
router
  .route("/:cabinId/price-rules")
  .get(
    protect,
    restrictTo(...BOOKING_ADMIN_ROLES),
    validate(priceRuleValidation.listCabinPriceRulesSchema),
    priceRuleController.list,
  )
  .post(
    protect,
    restrictTo(...BOOKING_ADMIN_ROLES),
    validate(priceRuleValidation.createCabinPriceRuleSchema),
    priceRuleController.create,
  );

router
  .route("/:id/categories")
  .get(cabinController.getCabinCategories)
  .post(validate(categoryValidation.assignCategoriesSchema), cabinController.setCabinCategories);

router
  .route("/:id/categories/:categoryId")
  .delete(
    validate(categoryValidation.cabinCategoryIdParamsSchema),
    cabinController.removeCabinCategory,
  );

router
  .route("/:id")
  .get(validate(cabinValidation.getCabinSchema), cabinController.getCabin)
  .delete(validate(cabinValidation.deleteCabinSchema), cabinController.deleteCabin)
  .patch(validate(cabinValidation.updateCabinSchema), cabinController.updateCabin);

export default router;

import { Router } from "express";
import * as cabinController from "../controllers/cabin.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as cabinValidation from "../validations/cabin.validation.js";
import * as categoryValidation from "../validations/category.validation.js";
import { paginationMiddleware } from "../middlewares/pagination.middleware.js";

const router = Router();

router
  .route("/")
  .get(
    validate(cabinValidation.listCabinsQueryValidation),
    paginationMiddleware,
    cabinController.getAll,
  )
  .post(cabinController.createCabin);
router.route("/cities").get(cabinController.getAllCity);
router.route("/amenities").get(cabinController.getAllAmenities);

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

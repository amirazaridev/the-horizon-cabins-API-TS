import { Router } from "express";
import * as categoryController from "../controllers/category.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as categoryValidation from "../validations/category.validation.js";

const router = Router();
const requireAdmin = [protect, restrictTo("admin")];

router
  .route("/")
  .get(categoryController.getAll)
  .post(
    ...requireAdmin,
    validate(categoryValidation.createCategorySchema),
    categoryController.create,
  );

router
  .route("/:id")
  .get(validate(categoryValidation.getCategorySchema), categoryController.getById)
  .patch(
    ...requireAdmin,
    validate(categoryValidation.updateCategorySchema),
    categoryController.update,
  )
  .delete(
    ...requireAdmin,
    validate(categoryValidation.deleteCategorySchema),
    categoryController.remove,
  );

export default router;

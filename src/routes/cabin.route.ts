import { Router } from "express";
import * as cabinController from "../controllers/cabin.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import * as cabinValidation from "../validations/cabin.validation.js";

const router = Router();
const requireAdminOrOwner = [protect, restrictTo("admin", "owner")];

router
  .route("/")
  .get(cabinController.getAll)
  .post(
    ...requireAdminOrOwner,
    validate(cabinValidation.createCabinSchema),
    cabinController.createCabin,
  );

router
  .route("/:id")
  .get(validate(cabinValidation.getCabinSchema), cabinController.getCabin)
  .delete(
    ...requireAdminOrOwner,
    validate(cabinValidation.deleteCabinSchema),
    cabinController.deleteCabin,
  )
  .patch(
    ...requireAdminOrOwner,
    validate(cabinValidation.updateCabinSchema),
    cabinController.updateCabin,
  );

export default router;

import { Router } from "express";
import * as locationController from "../controllers/location.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as locationValidation from "../validations/location.validation.js";

const router = Router();
const requireAdmin = [protect, restrictTo("admin")];

// -------------------------------------
// Regions — read only (no CRUD by design)
// -------------------------------------

router.route("/regions").get(locationController.getRegions);

router
  .route("/regions/:regionId/cities")
  .get(validate(locationValidation.regionCitiesSchema), locationController.getRegionCities);

// -------------------------------------
// Cities — full CRUD
// -------------------------------------

router
  .route("/cities")
  .get(locationController.getCities)
  .post(
    ...requireAdmin,
    validate(locationValidation.createCitySchema),
    locationController.createCity,
  );

router
  .route("/cities/:id")
  .patch(
    ...requireAdmin,
    validate(locationValidation.updateCitySchema),
    locationController.updateCity,
  )
  .delete(
    ...requireAdmin,
    validate(locationValidation.deleteCitySchema),
    locationController.removeCity,
  );

export default router;

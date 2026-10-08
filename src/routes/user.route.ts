import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { updateProfileSchema } from "../validations/user.validation.js";

const router = Router();

router.use(protect);

router.route("/me").get(userController.getMe).patch(validate(updateProfileSchema), userController.updateMe);

export default router;

import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/me", protect, userController.getMe);

export default router;

import { Router } from "express";
import cabinRouter from "./cabin.route.js";
import userRouter from "./user.route.js";
import authRouter from "./auth.route.js";

const router = Router();
router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/cabins", cabinRouter);

export default router;

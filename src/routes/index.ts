import { Router } from "express";
import cabinRouter from "./cabin.route.js";
import userRouter from "./user.route.js";
import authRouter from "./auth.route.js";
import categoryRouter from "./category.route.js";
import bookingRouter from "./booking.route.js";
import locationRouter from "./location.route.js";

const router = Router();
router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/categories", categoryRouter);
router.use("/cabins", cabinRouter);
router.use("/bookings", bookingRouter);
router.use("/locations", locationRouter);

export default router;

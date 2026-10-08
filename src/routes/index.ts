import { Router } from "express";
import cabinRouter from "./cabin.route.js";
import userRouter from "./user.route.js";
import authRouter from "./auth.route.js";
import otpRouter from "./otp.route.js";
import categoryRouter from "./category.route.js";
import bookingRouter from "./booking.route.js";
import locationRouter from "./location.route.js";
import priceRuleRouter from "./price-rule.route.js";
import priceCalendarRouter from "./price-calendar.route.js";
import settingRouter from "./setting.route.js";

const router = Router();
router.use("/auth", authRouter);
router.use("/otp", otpRouter);
router.use("/user", userRouter);
router.use("/categories", categoryRouter);
router.use("/cabins", cabinRouter);
router.use("/bookings", bookingRouter);
router.use("/locations", locationRouter);
router.use("/price-rules", priceRuleRouter);
router.use("/price-calendar", priceCalendarRouter);
router.use("/settings", settingRouter);

export default router;

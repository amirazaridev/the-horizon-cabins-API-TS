import { Router } from "express";
import * as bookingController from "../controllers/booking.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as bookingValidation from "../validations/booking.validation.js";
import { paginationMiddleware } from "../middlewares/pagination.middleware.js";
import { BOOKING_ADMIN_ROLES } from "../constants/booking.constants.js";

const router = Router();

//? تقویم تاریخ‌های رزرو‌شده‌ی یک کابین — **عمومی** (بدون احراز هویت).
//? صفحه‌ی جزئیات کابین برای همه‌ی بازدیدکننده‌ها (حتی بدون ورود) نمایش داده
//? می‌شود، پس روزهای پرشده هم باید برای همه غیرفعال شوند.
//? ⚠️ عمداً قبل از `router.use(protect)` ثبت می‌شود.
router.get(
  "/cabin/:cabinId/booked-dates",
  validate(bookingValidation.bookedDatesSchema),
  bookingController.getBookedDates,
);

router.use(protect);

router
  .route("/")
  .get(
    validate(bookingValidation.listBookingsQueryValidation),
    paginationMiddleware,
    bookingController.getAll,
  )
  .post(validate(bookingValidation.createBookingSchema), bookingController.create);

router.route("/:id").get(validate(bookingValidation.getBookingSchema), bookingController.getById);

router.route("/:id/pay").post(validate(bookingValidation.payBookingSchema), bookingController.pay);

router
  .route("/:id/cancel")
  .post(validate(bookingValidation.cancelBookingSchema), bookingController.cancel);

router
  .route("/:id/status")
  .patch(
    restrictTo(...BOOKING_ADMIN_ROLES),
    validate(bookingValidation.updateBookingStatusSchema),
    bookingController.updateStatus,
  );

export default router;

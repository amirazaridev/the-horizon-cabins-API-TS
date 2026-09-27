import { Router } from "express";
import * as bookingController from "../controllers/booking.controller.js";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as bookingValidation from "../validations/booking.validation.js";
import { paginationMiddleware } from "../middlewares/pagination.middleware.js";

const router = Router();

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
    restrictTo("admin"),
    validate(bookingValidation.updateBookingStatusSchema),
    bookingController.updateStatus,
  );

export default router;

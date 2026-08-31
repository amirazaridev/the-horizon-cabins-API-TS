import { Router } from "express";
import cabinRouter from "./cabin.route.js";

const router = Router();
router.use("/cabins", cabinRouter);

export default router;

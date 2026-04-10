import express from "express";
import { protect, restrictTo } from "../controllers/authController.js";
import { createCheckoutSession } from "../controllers/stripeCheckoutController.js";

const router = express.Router();

router.use(protect);

router.post("/create-checkout-session", restrictTo("user"), createCheckoutSession);

export default router;

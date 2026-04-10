import express from "express";
import { protect, restrictTo } from "../controllers/authController.js";
import { getAdminDashboard } from "../controllers/adminController.js";

const router = express.Router();

router.use(protect);
router.get("/dashboard", restrictTo("admin"), getAdminDashboard);

export default router;

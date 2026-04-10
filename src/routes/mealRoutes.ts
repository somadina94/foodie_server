import express from "express";
import {
  createMeal,
  deleteMeal,
  getMeal,
  listMeals,
  listVendorMeals,
  mealImageUpload,
  updateMeal,
} from "../controllers/mealController.js";
import { protect, restrictTo } from "../controllers/authController.js";

const router = express.Router();

router.get("/", listMeals);
router.get("/vendor/mine", protect, restrictTo("vendor", "admin"), listVendorMeals);
router.get("/:id", getMeal);

router.use(protect);
router.post(
  "/",
  restrictTo("admin", "vendor"),
  mealImageUpload.single("image"),
  createMeal,
);
router.patch(
  "/:id",
  restrictTo("admin", "vendor"),
  mealImageUpload.single("image"),
  updateMeal,
);
router.delete("/:id", restrictTo("admin", "vendor"), deleteMeal);

export default router;

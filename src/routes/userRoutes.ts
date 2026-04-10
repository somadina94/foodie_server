import express from "express";
import {
  signUp,
  forgotPassword,
  login,
  logout,
  protect,
  resetPassowrd,
  restrictTo,
  updatePassword,
} from "../controllers/authController.js";
import {
  getAllUsers,
  getMe,
  getOneUser,
  updateMe,
  setExpoPushToken,
  deleteMe,
  setWebPushToken,
  getRiderAvailability,
  setRiderAvailability,
} from "../controllers/userController.js";
import { updateUserRole } from "../controllers/adminController.js";

const router = express.Router();

router.post("/signUp", signUp);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgotPassword", forgotPassword);
router.post("/resetPassword", resetPassowrd);

router.use(protect);

router.patch("/role/:id", restrictTo("admin"), updateUserRole);
router.get("/rider/availability", restrictTo("rider"), getRiderAvailability);
router.patch("/rider/availability", restrictTo("rider"), setRiderAvailability);

router.patch("/updatePassword", updatePassword);

router.get("/getAllUsers", restrictTo("admin"), getAllUsers);

router.get("/getOneUser/:id", restrictTo("admin"), getOneUser);

router.get("/me", getMe);

router.patch("/updateMe", updateMe);
router.patch("/expoPushToken", setExpoPushToken);
router.patch("/webPushToken", setWebPushToken);
router.delete("/me", deleteMe);

export default router;

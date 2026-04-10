import express from "express";
import {
  getNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notificationController.js";
import { protect } from "../controllers/authController.js";

const router = express.Router();

router.use(protect);

router.get("/", listNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.get("/:id", getNotification);
router.patch("/:id/read", markNotificationRead);

export default router;

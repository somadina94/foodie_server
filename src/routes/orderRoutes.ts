import express from "express";
import {
  createOrder,
  getOrder,
  listMyOrders,
  listRiderOrders,
  listVendorOrders,
  patchDeliveryLocation,
  patchRiderLocation,
  updateOrderStatus,
} from "../controllers/orderController.js";
import { getOrderMessages, sendOrderMessage } from "../controllers/orderMessageController.js";
import { protect, restrictTo } from "../controllers/authController.js";

const router = express.Router();

router.use(protect);

router.post("/", restrictTo("user"), createOrder);
router.get("/me", restrictTo("user"), listMyOrders);
router.get("/kitchen", restrictTo("vendor"), listVendorOrders);
router.get("/delivery", restrictTo("rider"), listRiderOrders);
router.get("/:id/messages", getOrderMessages);
router.post("/:id/messages", sendOrderMessage);
router.patch("/:id/delivery-location", patchDeliveryLocation);
router.patch("/:id/rider-location", restrictTo("rider"), patchRiderLocation);
router.get("/:id", getOrder);
router.patch("/:id/status", updateOrderStatus);

export default router;

import type { Types } from "mongoose";
import Order from "../models/orderModel.js";
import Meal from "../models/mealModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import { enqueueKitchenAssignment, enqueueRiderAssignment } from "../queues/queues.js";
import { notifyOrderParticipantsByOrderId } from "../services/orderNotifications.js";
import type { OrderStatus } from "../types/order.js";

import type { Request, Response, NextFunction } from "express";

function canViewOrder(
  order: { customer: Types.ObjectId; vendorUser?: Types.ObjectId | null; riderUser?: Types.ObjectId | null },
  req: Request,
): boolean {
  const uid = req.user!._id.toString();
  const isCustomer = order.customer.toString() === uid;
  const isVendor = order.vendorUser?.toString() === uid;
  const isRider = order.riderUser?.toString() === uid;
  const isAdmin = req.user!.role === "admin";
  return isCustomer || isVendor || isRider || isAdmin;
}

function deliveryFee(): number {
  const n = Number(process.env.DELIVERY_FEE);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const createOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { items, deliveryAddress, paymentMethod } = req.body as {
      items?: { mealId: string; quantity: number }[];
      deliveryAddress?: string;
      /** `"stripe"` = wait for Checkout before the kitchen queue; omit or other = cash-on-delivery style (kitchen queue immediately). */
      paymentMethod?: "stripe";
    };
    if (!items?.length || !deliveryAddress) {
      return next(new AppError("items and deliveryAddress are required", 400));
    }

    const payWithStripe = paymentMethod === "stripe";

    const lineItems: {
      mealId: Types.ObjectId;
      name: string;
      price: number;
      quantity: number;
      imageUrl?: string;
    }[] = [];

    let subtotal = 0;
    for (const line of items) {
      const meal = await Meal.findById(line.mealId);
      if (!meal || !meal.isAvailable) {
        return next(new AppError(`Meal not available: ${line.mealId}`, 400));
      }
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      subtotal += meal.price * qty;
      lineItems.push({
        mealId: meal._id,
        name: meal.name,
        price: meal.price,
        quantity: qty,
        imageUrl: meal.imageUrl,
      });
    }

    const fee = deliveryFee();
    const total = subtotal + fee;

    const order = await Order.create({
      customer: req.user!._id,
      items: lineItems,
      subtotal,
      deliveryFee: fee,
      total,
      deliveryAddress,
      status: payWithStripe ? "pending_payment" : "pending_kitchen",
      paymentStatus: "unpaid",
    });

    if (!payWithStripe) {
      await enqueueKitchenAssignment(order._id.toString());
      await notifyOrderParticipantsByOrderId(order._id.toString());
    }

    res.status(201).json({ status: "success", data: { order } });
  },
);

export const listMyOrders = catchAsync(async (req: Request, res: Response) => {
  const orders = await Order.find({ customer: req.user!._id }).sort({ createdAt: -1, _id: -1 });
  res.status(200).json({ status: "success", results: orders.length, data: { orders } });
});

export const listVendorOrders = catchAsync(async (req: Request, res: Response) => {
  const orders = await Order.find({ vendorUser: req.user!._id }).sort({ createdAt: -1, _id: -1 });
  res.status(200).json({ status: "success", results: orders.length, data: { orders } });
});

export const listRiderOrders = catchAsync(async (req: Request, res: Response) => {
  const orders = await Order.find({ riderUser: req.user!._id }).sort({ createdAt: -1, _id: -1 });
  res.status(200).json({ status: "success", results: orders.length, data: { orders } });
});

export const getOrder = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new AppError("Order not found", 404));
  }
  if (!canViewOrder(order, req)) {
    return next(new AppError("Access denied", 403));
  }
  res.status(200).json({ status: "success", data: { order } });
});

/** Save geocoded delivery coordinates (from customer address string). */
export const patchDeliveryLocation = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { lat, lng } = req.body as { lat?: unknown; lng?: unknown };
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return next(new AppError("lat and lng must be finite numbers", 400));
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return next(new AppError("Invalid coordinates", 400));
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }
    if (!canViewOrder(order, req)) {
      return next(new AppError("Access denied", 403));
    }
    order.deliveryLat = lat;
    order.deliveryLng = lng;
    await order.save();
    res.status(200).json({ status: "success", data: { order } });
  },
);

/** Assigned rider reports GPS while the run is active. */
export const patchRiderLocation = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { lat, lng } = req.body as { lat?: unknown; lng?: unknown };
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return next(new AppError("lat and lng must be finite numbers", 400));
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return next(new AppError("Invalid coordinates", 400));
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }
    const uid = req.user!._id.toString();
    if (order.riderUser?.toString() !== uid) {
      return next(new AppError("Access denied", 403));
    }
    const trackable: OrderStatus[] = ["rider_assigned", "out_for_delivery"];
    if (!trackable.includes(order.status)) {
      return next(
        new AppError("Location updates are only allowed while assigned or out for delivery", 400),
      );
    }
    order.riderLat = lat;
    order.riderLng = lng;
    order.riderLocationUpdatedAt = new Date();
    await order.save();
    res.status(200).json({ status: "success", data: { order } });
  },
);

const vendorNext: Partial<Record<OrderStatus, OrderStatus>> = {
  kitchen_assigned: "preparing",
  preparing: "pending_rider",
};

const riderNext: Partial<Record<OrderStatus, OrderStatus>> = {
  rider_assigned: "out_for_delivery",
  out_for_delivery: "delivered",
};

export const updateOrderStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { status } = req.body as { status?: OrderStatus };
    if (!status) {
      return next(new AppError("status is required", 400));
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    const uid = req.user!._id.toString();
    const role = req.user!.role;

    if (role === "vendor" && order.vendorUser?.toString() === uid) {
      const nextSt = vendorNext[order.status];
      if (nextSt !== status) {
        return next(new AppError("Invalid status transition for kitchen", 400));
      }
      order.status = status;
      await order.save();
      if (status === "pending_rider") {
        await enqueueRiderAssignment(order._id.toString());
      }
      await notifyOrderParticipantsByOrderId(order._id.toString());
      return res.status(200).json({ status: "success", data: { order } });
    }

    if (role === "rider" && order.riderUser?.toString() === uid) {
      const nextSt = riderNext[order.status];
      if (nextSt !== status) {
        return next(new AppError("Invalid status transition for rider", 400));
      }
      order.status = status;
      if (status === "delivered") {
        order.riderLat = null;
        order.riderLng = null;
        order.riderLocationUpdatedAt = null;
      }
      await order.save();
      await notifyOrderParticipantsByOrderId(order._id.toString());
      return res.status(200).json({ status: "success", data: { order } });
    }

    if (role === "user" && order.customer.toString() === uid && status === "cancelled") {
      const cancellable: OrderStatus[] = [
        "pending_payment",
        "pending_kitchen",
        "kitchen_assigned",
        "preparing",
      ];
      if (!cancellable.includes(order.status)) {
        return next(new AppError("Order can no longer be cancelled", 400));
      }
      order.status = "cancelled";
      await order.save();
      await notifyOrderParticipantsByOrderId(order._id.toString());
      return res.status(200).json({ status: "success", data: { order } });
    }

    if (role === "admin") {
      order.status = status;
      await order.save();
      await notifyOrderParticipantsByOrderId(order._id.toString());
      return res.status(200).json({ status: "success", data: { order } });
    }

    return next(new AppError("Access denied", 403));
  },
);

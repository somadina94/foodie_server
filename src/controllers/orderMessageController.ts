import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import OrderMessage from "../models/orderMessageModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import type { IOrder } from "../types/order.js";
import type { IUser } from "../types/user.js";
import { notifyOrderChatMessage } from "../services/orderNotifications.js";

function uid(req: Request): string {
  return req.user!._id.toString();
}

function isOrderParticipant(order: IOrder, userId: string): boolean {
  if (order.customer.toString() === userId) return true;
  if (order.vendorUser?.toString() === userId) return true;
  if (order.riderUser?.toString() === userId) return true;
  return false;
}

function canAccessOrderChat(order: IOrder, userId: string, role: string): boolean {
  if (role === "admin") return true;
  return isOrderParticipant(order, userId);
}

/** Read history: kitchen assigned, order not cancelled. */
function canReadOrderChat(order: IOrder): boolean {
  if (order.status === "cancelled") return false;
  return Boolean(order.vendorUser);
}

/** New messages blocked after delivery; history still readable. */
function canSendOrderMessage(order: IOrder): boolean {
  if (!canReadOrderChat(order)) return false;
  if (order.status === "delivered") return false;
  return true;
}

async function loadOrderForChat(orderId: string): Promise<IOrder | null> {
  if (!mongoose.isValidObjectId(orderId)) return null;
  return Order.findById(orderId) as Promise<IOrder | null>;
}

function paramId(req: Request): string {
  const raw = req.params.id;
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] ?? "" : "";
}

function senderPayload(s: unknown): { _id: string; name: string; role: string } {
  const o = s as { _id?: mongoose.Types.ObjectId; name?: string; role?: string };
  const id = o._id;
  return {
    _id: id ? id.toString() : "",
    name: typeof o.name === "string" ? o.name : "User",
    role: typeof o.role === "string" ? o.role : "user",
  };
}

export const getOrderMessages = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderId = paramId(req);
    const order = await loadOrderForChat(orderId);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }
    const userId = uid(req);
    const role = req.user!.role;
    if (!canAccessOrderChat(order, userId, role)) {
      return next(new AppError("Access denied", 403));
    }
    if (!canReadOrderChat(order)) {
      return next(new AppError("Chat is available once the kitchen is assigned to your order.", 400));
    }

    const userOid = new mongoose.Types.ObjectId(userId);
    await OrderMessage.updateMany(
      { order: order._id, sender: { $ne: userOid } },
      { $addToSet: { deliveredTo: userOid, readBy: userOid } },
    );

    const refreshed = await OrderMessage.find({ order: order._id })
      .sort({ createdAt: 1 })
      .populate("sender", "name role")
      .lean();

    res.status(200).json({
      status: "success",
      results: refreshed.length,
      data: {
        messages: refreshed.map((m) => ({
          _id: m._id.toString(),
          order: order._id.toString(),
          text: m.text,
          createdAt: m.createdAt,
          sender: senderPayload(m.sender),
          deliveredTo: (m.deliveredTo ?? []).map((x: mongoose.Types.ObjectId) => x.toString()),
          readBy: (m.readBy ?? []).map((x: mongoose.Types.ObjectId) => x.toString()),
        })),
      },
    });
  },
);

export const sendOrderMessage = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderId = paramId(req);
    const { text } = req.body as { text?: string };
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed.length) {
      return next(new AppError("Message text is required", 400));
    }
    if (trimmed.length > 4000) {
      return next(new AppError("Message is too long", 400));
    }

    const order = await loadOrderForChat(orderId);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }
    const userId = uid(req);
    const role = req.user!.role;
    if (!canAccessOrderChat(order, userId, role)) {
      return next(new AppError("Access denied", 403));
    }
    if (!canReadOrderChat(order)) {
      return next(new AppError("Chat opens after the kitchen is assigned.", 400));
    }
    if (!canSendOrderMessage(order)) {
      return next(
        new AppError("This order has been delivered — chat is closed. You can still read the history.", 400),
      );
    }

    const msg = await OrderMessage.create({
      order: order._id,
      sender: req.user!._id,
      text: trimmed,
      deliveredTo: [],
      readBy: [],
    });

    const populated = await OrderMessage.findById(msg._id).populate("sender", "name role").lean();
    if (!populated) {
      return next(new AppError("Message not created", 500));
    }

    const sender = req.user as IUser;
    const senderName =
      typeof sender.name === "string" && sender.name.trim() ? sender.name.trim() : "Someone";
    void notifyOrderChatMessage(order._id.toString(), req.user!._id as mongoose.Types.ObjectId, senderName, trimmed);

    res.status(201).json({
      status: "success",
      data: {
        message: {
          _id: populated._id.toString(),
          order: order._id.toString(),
          text: populated.text,
          createdAt: populated.createdAt,
          sender: senderPayload(populated.sender),
          deliveredTo: (populated.deliveredTo ?? []).map((x: mongoose.Types.ObjectId) => x.toString()),
          readBy: (populated.readBy ?? []).map((x: mongoose.Types.ObjectId) => x.toString()),
        },
      },
    });
  },
);

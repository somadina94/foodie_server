import mongoose from "mongoose";
import Notification from "../models/notificationModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

import type { Request, Response, NextFunction } from "express";

export const listNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const notifications = await Notification.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const unreadCount = await Notification.countDocuments({ user: userId, readAt: null });

  res.status(200).json({
    status: "success",
    results: notifications.length,
    data: {
      notifications: notifications.map((n) => ({
        _id: n._id.toString(),
        title: n.title,
        body: n.body,
        orderId: n.orderId ?? null,
        type: n.type,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt?.toISOString(),
        updatedAt: n.updatedAt?.toISOString(),
      })),
      unreadCount,
    },
  });
});

function paramId(req: Request): string | undefined {
  const p = req.params["id"];
  return typeof p === "string" ? p : Array.isArray(p) ? p[0] : undefined;
}

export const getNotification = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = paramId(req);
    if (!id || !mongoose.isValidObjectId(id)) {
      return next(new AppError("Invalid notification id", 400));
    }
    const doc = await Notification.findOne({
      _id: new mongoose.Types.ObjectId(id),
      user: req.user!._id,
    }).lean();
    if (!doc) {
      return next(new AppError("Notification not found", 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        notification: {
          _id: doc._id.toString(),
          title: doc.title,
          body: doc.body,
          orderId: doc.orderId ?? null,
          type: doc.type,
          readAt: doc.readAt?.toISOString() ?? null,
          createdAt: doc.createdAt?.toISOString(),
          updatedAt: doc.updatedAt?.toISOString(),
        },
      },
    });
  },
);

export const markNotificationRead = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = paramId(req);
    if (!id || !mongoose.isValidObjectId(id)) {
      return next(new AppError("Invalid notification id", 400));
    }
    const doc = await Notification.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), user: req.user!._id },
      { readAt: new Date() },
      { new: true },
    ).lean();
    if (!doc) {
      return next(new AppError("Notification not found", 404));
    }
    res.status(200).json({ status: "success", data: { notificationId: doc._id.toString() } });
  },
);

export const markAllNotificationsRead = catchAsync(async (req: Request, res: Response) => {
  const r = await Notification.updateMany(
    { user: req.user!._id, readAt: null },
    { readAt: new Date() },
  );
  res.status(200).json({
    status: "success",
    data: { modifiedCount: r.modifiedCount },
  });
});

import mongoose, { Model } from "mongoose";
import type { INotification } from "../types/notification.js";

const notificationSchema = new mongoose.Schema<INotification>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    orderId: { type: String, default: null },
    type: { type: String, default: "order" },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });

const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
);
export default Notification;

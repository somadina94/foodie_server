import type { Types } from "mongoose";
import Notification from "../models/notificationModel.js";

export async function recordInAppNotification(
  userId: Types.ObjectId,
  title: string,
  body: string,
  orderId: string,
  type = "order",
): Promise<void> {
  try {
    await Notification.create({
      user: userId,
      title,
      body,
      orderId,
      type,
    });
  } catch (e) {
    console.error("recordInAppNotification failed:", e);
  }
}

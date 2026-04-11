import mongoose from "mongoose";
import Email from "../utils/email.js";
import Order from "../models/orderModel.js";
import { sendExpoPush, sendWebPushToUser } from "../utils/pushNotifications.js";
import { recordInAppNotification } from "./inAppNotifications.js";
import type { IUser } from "../types/user.js";
import type { OrderStatus } from "../types/order.js";

/** Copy for the assigned vendor only — kitchen queue just set vendorUser. */
function vendorEmailCopy(status: OrderStatus): { headline: string; detail: string } {
  if (status === "kitchen_assigned") {
    return {
      headline: "New order assigned to your kitchen",
      detail:
        "A customer order has been routed to you. Sign in to your Foodie kitchen dashboard to view items, totals, and the delivery address.",
    };
  }
  return statusCopy(status);
}

/** Copy for the assigned rider only — rider queue just set riderUser. */
function riderEmailCopy(status: OrderStatus): { headline: string; detail: string } {
  if (status === "rider_assigned") {
    return {
      headline: "New delivery assigned to you",
      detail:
        "You have been assigned a delivery run. Open your Foodie rider deliveries to see the customer address and order details.",
    };
  }
  return statusCopy(status);
}

function statusCopy(status: OrderStatus): { headline: string; detail: string } {
  const map: Record<OrderStatus, { headline: string; detail: string }> = {
    pending_payment: {
      headline: "Awaiting payment",
      detail: "Complete checkout to submit your order to the kitchen.",
    },
    pending_kitchen: {
      headline: "Order received",
      detail: "Your order is waiting for the kitchen.",
    },
    kitchen_assigned: {
      headline: "Kitchen has your order",
      detail: "The restaurant has picked up your order.",
    },
    preparing: {
      headline: "Being prepared",
      detail: "Your meal is being prepared.",
    },
    pending_rider: {
      headline: "Ready for delivery",
      detail: "Your order is ready. We are assigning a rider.",
    },
    rider_assigned: {
      headline: "Rider assigned",
      detail: "A rider is on the way to the restaurant.",
    },
    out_for_delivery: {
      headline: "On the way",
      detail: "Your order is out for delivery.",
    },
    delivered: {
      headline: "Delivered",
      detail: "Your order has been delivered. Enjoy!",
    },
    cancelled: {
      headline: "Order cancelled",
      detail: "This order has been cancelled.",
    },
  };
  return map[status];
}

async function emailUser(user: IUser, subject: string, headline: string, detail: string, orderId: string) {
  try {
    const email = new Email(user, "");
    await email.sendOrderEvent(subject, headline, detail, orderId);
  } catch (e) {
    console.error("Order email failed:", e);
  }
}

async function pushUser(
  user: IUser,
  title: string,
  body: string,
  orderId: string,
  notificationType = "order",
) {
  const data = { orderId, type: notificationType };
  const expo = user.expoPushToken ?? [];
  await sendExpoPush(expo, title, body, data);
  await sendWebPushToUser(user, title, body, data);
  if (user._id) {
    await recordInAppNotification(user._id, title, body, orderId, notificationType);
  }
}

/** Push + in-app for order chat — notifies customer, vendor, and rider except the sender. */
export async function notifyOrderChatMessage(
  orderId: string,
  senderId: mongoose.Types.ObjectId,
  senderName: string,
  textPreview: string,
): Promise<void> {
  try {
    const order = await Order.findById(orderId)
      .populate("customer")
      .populate("vendorUser")
      .populate("riderUser");
    if (!order) return;

    const oid = order._id.toString();
    const short = oid.slice(-6);
    const title = `New message — Order #${short}`;
    const preview =
      textPreview.length > 100 ? `${textPreview.slice(0, 100)}…` : textPreview;
    const body = `${senderName}: ${preview}`;

    const recipients: (IUser | null | undefined)[] = [
      order.customer as unknown as IUser,
      order.vendorUser as unknown as IUser | null,
      order.riderUser as unknown as IUser | null,
    ];

    for (const user of recipients) {
      if (!user?._id) continue;
      if (user._id.equals(senderId)) continue;
      await pushUser(user, title, body, oid, "order_message");
    }
  } catch (e) {
    console.error("notifyOrderChatMessage failed:", e);
  }
}

/** Load order with users and send email + push for the current status. */
export async function notifyOrderParticipantsByOrderId(orderId: string): Promise<void> {
  const order = await Order.findById(orderId)
    .populate("customer")
    .populate("vendorUser")
    .populate("riderUser");
  if (!order) return;

  const oid = order._id.toString();
  const { headline, detail } = statusCopy(order.status);
  const subject = `${process.env.COMPANY_NAME}: ${headline} (#${oid.slice(-6)})`;

  const customer = order.customer as unknown as IUser;
  if (customer?.email) {
    await emailUser(customer, subject, headline, detail, oid);
  }
  if (customer?._id) {
    await pushUser(customer, headline, `${detail} Order #${oid.slice(-6)}`, oid);
  }

  const vendor = order.vendorUser as unknown as IUser | null;
  if (vendor?.email && order.status !== "pending_kitchen") {
    const v = vendorEmailCopy(order.status);
    const vSubject = `${process.env.COMPANY_NAME}: ${v.headline} (#${oid.slice(-6)})`;
    await emailUser(vendor, vSubject, `Kitchen — ${v.headline}`, v.detail, oid);
    await pushUser(vendor, `Kitchen: ${v.headline}`, v.detail, oid);
  }

  const rider = order.riderUser as unknown as IUser | null;
  if (
    rider?.email &&
    ["rider_assigned", "out_for_delivery", "delivered"].includes(order.status)
  ) {
    const r = riderEmailCopy(order.status);
    const rSubject = `${process.env.COMPANY_NAME}: ${r.headline} (#${oid.slice(-6)})`;
    await emailUser(rider, rSubject, `Delivery — ${r.headline}`, r.detail, oid);
    await pushUser(rider, `Delivery: ${r.headline}`, r.detail, oid);
  }
}

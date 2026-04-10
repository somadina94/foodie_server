import mongoose, { Model } from "mongoose";
import type { IOrder } from "../types/order.js";

const orderItemSchema = new mongoose.Schema(
  {
    mealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    imageUrl: { type: String },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema<IOrder>(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    deliveryAddress: { type: String, required: true },
    /** Geocoded from deliveryAddress (set by client after Nominatim or similar). */
    deliveryLat: { type: Number, default: null },
    deliveryLng: { type: Number, default: null },
    /** Last reported rider GPS while assigned / out for delivery. */
    riderLat: { type: Number, default: null },
    riderLng: { type: Number, default: null },
    riderLocationUpdatedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "pending_kitchen",
        "kitchen_assigned",
        "preparing",
        "pending_rider",
        "rider_assigned",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending_kitchen",
    },
    vendorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    riderUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "failed", "refunded"],
      default: "unpaid",
    },
    stripeCheckoutSessionId: { type: String, default: null },
  },
  { timestamps: true },
);

const Order: Model<IOrder> = mongoose.model<IOrder>("Order", orderSchema);
export default Order;

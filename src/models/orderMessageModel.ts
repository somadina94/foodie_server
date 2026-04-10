import mongoose, { Model } from "mongoose";
import type { IOrderMessage } from "../types/orderMessage.js";

const orderMessageSchema = new mongoose.Schema<IOrderMessage>(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

orderMessageSchema.index({ order: 1, createdAt: 1 });

const OrderMessage: Model<IOrderMessage> = mongoose.model<IOrderMessage>(
  "OrderMessage",
  orderMessageSchema,
);
export default OrderMessage;

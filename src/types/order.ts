import type { Document, Types } from "mongoose";

export type OrderStatus =
  | "pending_payment"
  | "pending_kitchen"
  | "kitchen_assigned"
  | "preparing"
  | "pending_rider"
  | "rider_assigned"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface OrderItem {
  mealId: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export interface IOrder extends Document {
  customer: Types.ObjectId;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  riderLat?: number | null;
  riderLng?: number | null;
  riderLocationUpdatedAt?: Date | null;
  status: OrderStatus;
  vendorUser?: Types.ObjectId | null;
  riderUser?: Types.ObjectId | null;
  paymentStatus: PaymentStatus;
  stripeCheckoutSessionId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

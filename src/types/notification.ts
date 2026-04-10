import type { Document, Types } from "mongoose";

export interface INotification extends Document {
  user: Types.ObjectId;
  title: string;
  body: string;
  orderId?: string | null;
  type: string;
  readAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

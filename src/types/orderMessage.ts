import type { Document, Types } from "mongoose";

export interface IOrderMessage extends Document {
  order: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
  deliveredTo: Types.ObjectId[];
  readBy: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

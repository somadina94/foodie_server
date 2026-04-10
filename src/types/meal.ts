import type { Document, Types } from "mongoose";

export interface IMeal extends Document {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  b2FileName: string;
  /** Backblaze file id for delete/replace */
  b2FileId?: string;
  isAvailable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: Types.ObjectId;
}

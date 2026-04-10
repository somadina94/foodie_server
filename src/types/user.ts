import type { Document } from "mongoose";
import type { WebPushToken } from "./webPushToken.js";

export interface IUser extends Document {
  name: string;
  role: "user" | "admin" | "manager";
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  expoPushToken?: string[];
  webPushToken?: WebPushToken[];
  password: string;
  passwordConfirm?: string;
  passwordChangedAt?: Date;
  passwordResetToken?: string | null;
  passwordResetTokenExpires?: Date | null;
  createdAt?: Date;

  // Methods
  correctPassword(
    candidatePassword: string,
    userPassword: string,
  ): Promise<boolean>;
  createPasswordResetToken(): string;
  changedPasswordAfterJWT(JWTTimestamp: number | undefined): boolean;
}

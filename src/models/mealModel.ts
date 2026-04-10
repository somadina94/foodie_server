import mongoose, { Model } from "mongoose";
import type { IMeal } from "../types/meal.js";

const mealSchema = new mongoose.Schema<IMeal>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, required: true },
    b2FileName: { type: String, required: true },
    b2FileId: { type: String },
    isAvailable: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const Meal: Model<IMeal> = mongoose.model<IMeal>("Meal", mealSchema);
export default Meal;

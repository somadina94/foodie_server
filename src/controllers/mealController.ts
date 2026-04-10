import multer from "multer";
import Meal from "../models/mealModel.js";
import { deleteMealFileFromB2, uploadMealImageToB2 } from "../storage/b2.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

import type { Types } from "mongoose";
import type { Request, Response, NextFunction } from "express";

const memory = multer.memoryStorage();
export const mealImageUpload = multer({
  storage: memory,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      cb(new AppError("Only image uploads are allowed", 400));
      return;
    }
    cb(null, true);
  },
});

function parseBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function vendorCanAccessMeal(req: Request, meal: { createdBy?: Types.ObjectId | null }): boolean {
  if (req.user?.role === "admin") return true;
  if (
    req.user?.role === "vendor" &&
    meal.createdBy &&
    meal.createdBy.equals(req.user._id as Types.ObjectId)
  ) {
    return true;
  }
  return false;
}

export const listMeals = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const meals = await Meal.find({ isAvailable: true }).sort({ name: 1 });
    res.status(200).json({ status: "success", results: meals.length, data: { meals } });
  },
);

/** Meals the vendor created (or all meals for admin). */
export const listVendorMeals = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const filter =
      req.user?.role === "admin" ? {} : { createdBy: req.user!._id };
    const meals = await Meal.find(filter).sort({ updatedAt: -1 });
    res.status(200).json({ status: "success", results: meals.length, data: { meals } });
  },
);

export const getMeal = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const meal = await Meal.findById(req.params.id);
  if (!meal) {
    return next(new AppError("Meal not found", 404));
  }
  res.status(200).json({ status: "success", data: { meal } });
});

export const createMeal = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file?.buffer) {
      return next(new AppError("Meal image is required", 400));
    }
    const { name, description, price } = req.body as {
      name?: string;
      description?: string;
      price?: string;
    };
    if (!name || price === undefined) {
      return next(new AppError("name and price are required", 400));
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return next(new AppError("Invalid price", 400));
    }

    const { imageUrl, b2FileName, fileId } = await uploadMealImageToB2(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );

    const avail = parseBool(req.body.isAvailable);
    const meal = await Meal.create({
      name,
      description: description ?? "",
      price: priceNum,
      imageUrl,
      b2FileName,
      b2FileId: fileId,
      ...(avail !== undefined ? { isAvailable: avail } : {}),
      ...(req.user?._id ? { createdBy: req.user._id } : {}),
    });

    res.status(201).json({ status: "success", data: { meal } });
  },
);

export const updateMeal = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const meal = await Meal.findById(req.params.id);
    if (!meal) {
      return next(new AppError("Meal not found", 404));
    }
    if (!vendorCanAccessMeal(req, meal)) {
      return next(new AppError("Access denied", 403));
    }

    const allowed = ["name", "description", "price", "isAvailable"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "isAvailable") {
          const b = parseBool(req.body[key]);
          if (b !== undefined) update[key] = b;
        } else {
          update[key] = req.body[key];
        }
      }
    }
    if (update.price !== undefined) {
      const p = Number(update.price);
      if (!Number.isFinite(p) || p < 0) {
        return next(new AppError("Invalid price", 400));
      }
      update.price = p;
    }

    if (req.file?.buffer) {
      const { imageUrl, b2FileName, fileId } = await uploadMealImageToB2(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );
      if (meal.b2FileId) {
        await deleteMealFileFromB2(meal.b2FileId, meal.b2FileName);
      }
      update.imageUrl = imageUrl;
      update.b2FileName = b2FileName;
      update.b2FileId = fileId;
    }

    const updated = await Meal.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ status: "success", data: { meal: updated } });
  },
);

export const deleteMeal = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const meal = await Meal.findById(req.params.id);
  if (!meal) {
    return next(new AppError("Meal not found", 404));
  }
  if (!vendorCanAccessMeal(req, meal)) {
    return next(new AppError("Access denied", 403));
  }

  if (meal.b2FileId) {
    await deleteMealFileFromB2(meal.b2FileId, meal.b2FileName);
  }
  await meal.deleteOne();
  res.status(204).send();
});

import User from "../models/userModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import { getRedisConnection, RIDERS_AVAILABLE_KEY } from "../config/redisConnection.js";

import type { Request, Response, NextFunction } from "express";
import type { IUser } from "../types/user.js";

// GET ALL USERS
export const getAllUsers = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Fetch users
    const users = await User.find().sort({ createdAt: -1 });

    // Send response
    res.status(200).json({
      status: "success",
      data: {
        users,
      },
    });
  },
);

// GET ONE USER
export const getOneUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Get user
    const user = await User.findById(req.params.id);

    // Return error is no user with id
    if (!user) {
      return next(new AppError("No user found with that Id", 404));
    }

    // Send response
    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  },
);

// UPDATE USER
export const updateMe = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Check if body has password field and return error
    if (req.body.password || req.body.passwordConfirm) {
      return next(
        new AppError("You cannot update password with this route", 401),
      );
    }

    // Find and update user
    const updatedUser = await User.findByIdAndUpdate(req.user?._id, req.body, {
      new: true,
    });

    // Send response
    res.status(200).json({
      status: "success",
      message: "Your account has been updated successfully",
      data: {
        user: updatedUser,
      },
    });
  },
);

// GET ME
export const getMe = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Get current user
    const user = req.user;

    // Send response
    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  },
);

export const setWebPushToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { webPushToken } = req.body;

    if (!webPushToken) {
      return next(
        new AppError(
          "Please provide a valid web push notifications token",
          400,
        ),
      );
    }

    const user = await User.findById(req.user!._id);
    if (!user) {
      return next(new AppError("You are not logged in", 401));
    }

    if (!Array.isArray(user.webPushToken)) {
      user.webPushToken = [];
    }

    const existing = user.webPushToken.some((t) => t.endpoint === webPushToken.endpoint);
    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Already subscribed to web push on this device",
      });
    }

    user.webPushToken.push(webPushToken);
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: "success",
      message: "Web push notification subscription successful",
      data: { user },
    });
  },
);

export const getRiderAvailability = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.user!._id.toString();
    const redis = getRedisConnection();
    const n = await redis.sismember(RIDERS_AVAILABLE_KEY, id);
    const available = n === 1;
    res.status(200).json({
      status: "success",
      data: { available },
    });
  },
);

export const setRiderAvailability = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { available } = req.body as { available?: boolean };
    if (typeof available !== "boolean") {
      return next(new AppError("Field available (boolean) is required", 400));
    }
    const id = req.user!._id.toString();
    const redis = getRedisConnection();
    if (available) {
      await redis.sadd(RIDERS_AVAILABLE_KEY, id);
    } else {
      await redis.srem(RIDERS_AVAILABLE_KEY, id);
    }
    res.status(200).json({
      status: "success",
      data: { available },
    });
  },
);

export const setExpoPushToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return next(
        new AppError("Please provide a valid expo notifications token", 400),
      );
    }

    const user = await User.findById(req.user!._id);
    if (!user) {
      return next(new AppError("You are not logged in", 401));
    }

    // Ensure array exists
    if (!Array.isArray(user.expoPushToken)) {
      user.expoPushToken = [];
    }

    if (user.expoPushToken.includes(expoPushToken)) {
      return res.status(200).json({
        status: "success",
        message: "Already subscribed to push notification",
      });
    }

    user.expoPushToken = Array.from(
      new Set([...user.expoPushToken, expoPushToken]),
    );

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: "success",
      message: "Expo notifications token set successfully",
      data: { user },
    });
  },
);

export const deleteMe = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // GET /notes/:id
    const user: IUser | null = await User.findById(req.user!._id);

    // Check if exists
    if (!user) {
      return next(new AppError("No user found with that ID", 404));
    }

    // DELETE /notes/:id
    await User.findOneAndDelete({ _id: req.user?._id as unknown as string });
    res.status(200).json({
      status: "success",
      message: "Your data has been completed deleted",
    });
  },
);

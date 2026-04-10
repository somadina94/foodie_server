import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import type { IUser } from "../types/user.js";

import type { Request, Response, NextFunction } from "express";

const DASHBOARD_DAYS = 14;

function utcDateLabels(days: number): string[] {
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    labels.push(d.toISOString().slice(0, 10));
  }
  return labels;
}

export const updateUserRole = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { role } = req.body as { role?: IUser["role"] };
    const allowed: IUser["role"][] = ["user", "admin", "vendor", "rider"];
    if (!role || !allowed.includes(role)) {
      return next(new AppError("Valid role is required", 400));
    }

    if (req.params.id === req.user!._id.toString()) {
      return next(new AppError("Use a different route to change your own role", 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true },
    );
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { user },
    });
  },
);

export const getAdminDashboard = catchAsync(async (_req: Request, res: Response) => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (DASHBOARD_DAYS - 1));
  start.setUTCHours(0, 0, 0, 0);

  const [byStatus, byRole, dailyAgg, revenueRow, totalOrders] = await Promise.all([
    Order.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    User.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
    Order.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate<{ total: number }>([
      { $match: { status: "delivered" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Order.countDocuments(),
  ]);

  const dailyMap = new Map(dailyAgg.map((d) => [d._id, d.count]));
  const labels = utcDateLabels(DASHBOARD_DAYS);
  const dailyOrders = labels.map((date) => ({ date, orders: dailyMap.get(date) ?? 0 }));

  const ordersByStatus = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  const usersByRole = Object.fromEntries(byRole.map((row) => [row._id, row.count]));

  res.status(200).json({
    status: "success",
    data: {
      totalOrders,
      revenueDelivered: revenueRow[0]?.total ?? 0,
      ordersByStatus,
      usersByRole,
      dailyOrders,
    },
  });
});

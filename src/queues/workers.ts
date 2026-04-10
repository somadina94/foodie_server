import { Worker } from "bullmq";
import { getRedisConnection, RIDERS_AVAILABLE_KEY } from "../config/redisConnection.js";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import { sweepPendingRiderAssignments } from "./queues.js";
import { notifyOrderParticipantsByOrderId } from "../services/orderNotifications.js";

function kitchenCapacityLimit(): number {
  const n = Number(process.env.KITCHEN_MAX_CONCURRENT);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export function registerWorkers(): void {
  const redisConnection = getRedisConnection();

  new Worker<{ orderId: string }>(
    "kitchen-assignment",
    async (job) => {
      const { orderId } = job.data;
      const order = await Order.findById(orderId);
      if (!order || order.status !== "pending_kitchen") {
        return;
      }

      const limit = kitchenCapacityLimit();
      const active = await Order.countDocuments({
        status: { $in: ["kitchen_assigned", "preparing"] },
      });
      if (active >= limit) {
        throw new Error("KITCHEN_AT_CAPACITY");
      }

      const vendor = await User.findOne({ role: "vendor" }).sort({ createdAt: 1 });
      if (!vendor) {
        throw new Error("NO_VENDOR_USER");
      }

      order.vendorUser = vendor._id;
      order.status = "kitchen_assigned";
      await order.save();
      await notifyOrderParticipantsByOrderId(orderId);
    },
    { connection: redisConnection },
  );

  new Worker<{ orderId: string }>(
    "rider-assignment",
    async (job) => {
      const { orderId } = job.data;
      const order = await Order.findById(orderId);
      if (!order || order.status !== "pending_rider") {
        return;
      }

      const riderId = await redisConnection.spop(RIDERS_AVAILABLE_KEY);
      if (!riderId) {
        throw new Error("NO_RIDER_AVAILABLE");
      }

      const rider = await User.findById(riderId);
      if (!rider || rider.role !== "rider") {
        throw new Error("INVALID_RIDER_USER");
      }

      order.riderUser = rider._id;
      order.status = "rider_assigned";
      await order.save();
      await notifyOrderParticipantsByOrderId(orderId);
    },
    { connection: redisConnection },
  );

  const sweepMs = Number(process.env.RIDER_ASSIGN_SWEEP_MS ?? 30_000);
  if (Number.isFinite(sweepMs) && sweepMs >= 5000) {
    const runSweep = () => {
      void sweepPendingRiderAssignments().catch((e) => {
        console.error("[rider-assignment sweep]", e);
      });
    };
    runSweep();
    setInterval(runSweep, sweepMs);
    console.log(
      `[rider-assignment] Sweep every ${sweepMs}ms for pending_rider orders (retry failed / re-queue missing jobs).`,
    );
  }

  console.log("BullMQ workers registered (kitchen + rider).");
}

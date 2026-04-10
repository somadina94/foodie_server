import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redisConnection.js";
import Order from "../models/orderModel.js";

let kitchenQueue: Queue | null = null;
let riderQueue: Queue | null = null;

function getKitchenQueue(): Queue {
  if (!kitchenQueue) {
    kitchenQueue = new Queue("kitchen-assignment", {
      connection: getRedisConnection(),
    });
  }
  return kitchenQueue;
}

export function getRiderQueue(): Queue {
  if (!riderQueue) {
    riderQueue = new Queue("rider-assignment", {
      connection: getRedisConnection(),
    });
  }
  return riderQueue;
}

function riderAssignRetryDelayMs(): number {
  const n = Number(process.env.RIDER_ASSIGN_RETRY_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 15_000;
}

function riderAssignMaxAttempts(): number {
  const n = Number(process.env.RIDER_ASSIGN_MAX_ATTEMPTS);
  return Number.isFinite(n) && n >= 1 ? n : 1000;
}

export async function enqueueKitchenAssignment(orderId: string): Promise<void> {
  await getKitchenQueue().add(
    "assign",
    { orderId },
    {
      jobId: `kitchen-${orderId}`,
      attempts: 100,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
    },
  );
}

export async function enqueueRiderAssignment(orderId: string): Promise<void> {
  await getRiderQueue().add(
    "assign",
    { orderId },
    {
      jobId: `rider-${orderId}`,
      attempts: riderAssignMaxAttempts(),
      backoff: { type: "fixed", delay: riderAssignRetryDelayMs() },
      removeOnComplete: { count: 1000 },
    },
  );
}

/**
 * Re-queue or retry rider assignment for orders still in pending_rider (no rider picked yet).
 * Runs on an interval so when riders go online later, stuck orders get another chance.
 */
export async function sweepPendingRiderAssignments(): Promise<void> {
  const queue = getRiderQueue();
  const orders = await Order.find({ status: "pending_rider" }).select("_id").lean();
  for (const o of orders) {
    const id = o._id.toString();
    const jobId = `rider-${id}`;
    const job = await queue.getJob(jobId);
    if (!job) {
      await enqueueRiderAssignment(id);
      continue;
    }
    const state = await job.getState();
    if (state === "failed") {
      await job.retry();
    }
  }
}

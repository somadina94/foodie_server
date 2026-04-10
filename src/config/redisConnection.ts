import { Redis } from "ioredis";

const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

let client: Redis | null = null;
let warnedNoRedis = false;

/**
 * Shared Redis client for BullMQ and rider availability.
 * Uses lazy connect so the API can boot without Redis until something needs it.
 */
export function getRedisConnection(): Redis {
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 8) {
          if (!warnedNoRedis) {
            warnedNoRedis = true;
            console.error(
              "[Redis] Not reachable at %s — start Redis: cd server && npm run redis:up",
              url,
            );
          }
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });
  }
  return client;
}

export const RIDERS_AVAILABLE_KEY = "foodie:riders:available";

/** Call before registering BullMQ workers. */
export async function ensureRedisReady(): Promise<boolean> {
  try {
    const r = getRedisConnection();
    await r.connect();
    await r.ping();
    return true;
  } catch {
    return false;
  }
}

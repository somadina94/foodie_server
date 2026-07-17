import webpush from "web-push";
import type { IUser } from "../types/user.js";
import User from "../models/userModel.js";

let vapidConfigured = false;

function ensureWebPushVapid() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() ??
    `mailto:${process.env.EMAIL_FROM ?? "support@localhost"}`;
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
  }
}

/** Expo tokens look like ExponentPushToken[...] or ExpoPushToken[...]. */
export function isExpoPushToken(token: string): boolean {
  return (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
}

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/** Drop DeviceNotRegistered tokens from users (same idea as Luxestate clearExpoToken). */
async function clearInvalidExpoTokens(invalid: Set<string>): Promise<void> {
  if (invalid.size === 0) return;
  const list = [...invalid];
  try {
    await User.updateMany(
      { expoPushToken: { $in: list } },
      { $pullAll: { expoPushToken: list } },
    );
    console.warn(
      "Cleared invalid Expo push tokens:",
      list.map((t) => `${t.slice(0, 28)}…`),
    );
  } catch (e) {
    console.error("Failed to clear invalid Expo tokens:", e);
  }
}

/**
 * Send via Expo Push API (same shape as Luxestate notificationHelpers).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */
export async function sendExpoPush(
  expoTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const tokens = [
    ...new Set(
      expoTokens
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => isExpoPushToken(t)),
    ),
  ];
  if (tokens.length === 0) {
    if (expoTokens.length > 0) {
      console.warn(
        "sendExpoPush: tokens present but none matched Expo format:",
        expoTokens.slice(0, 3),
      );
    }
    return;
  }

  const messages = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title,
    body,
    data: data ?? {},
    // Must match the channel created in the app (ensureAndroidNotificationChannel).
    channelId: "default",
    priority: "high" as const,
  }));

  const invalidTokens = new Set<string>();

  // Expo accepts one object or an array (max 100). Chunk for safety.
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("Expo push HTTP failed:", res.status, text);
        continue;
      }

      let parsed: { data?: ExpoPushTicket | ExpoPushTicket[] } | null = null;
      try {
        parsed = JSON.parse(text) as { data?: ExpoPushTicket | ExpoPushTicket[] };
      } catch {
        console.error("Expo push: could not parse response:", text.slice(0, 500));
        continue;
      }

      const tickets = Array.isArray(parsed.data)
        ? parsed.data
        : parsed.data
          ? [parsed.data]
          : [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") return;
        const token = chunk[idx]?.to ?? "(unknown)";
        const code = ticket.details?.error ?? "unknown";
        console.error(
          `Expo push ticket error [${code}] for ${token}: ${ticket.message}`,
        );
        if (code === "DeviceNotRegistered" && token !== "(unknown)") {
          invalidTokens.add(token);
        }
        if (code === "InvalidCredentials" || code === "Unauthorized") {
          console.error(
            "→ Android FCM credentials are missing/invalid on Expo. " +
              "Run `eas credentials` → Android → Push Notifications (FCM V1) and upload your Firebase service-account JSON " +
              "(same steps used for Luxestate).",
          );
        }
      });
    } catch (e) {
      console.error("Expo push request failed:", e);
    }
  }

  await clearInvalidExpoTokens(invalidTokens);
}

export async function sendWebPushToUser(
  user: IUser,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  ensureWebPushVapid();
  if (!vapidConfigured) return;

  const subs = user.webPushToken ?? [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        },
        JSON.stringify({ title, body, ...data }),
      );
    } catch (e) {
      console.error("Web push failed:", e);
    }
  }
}

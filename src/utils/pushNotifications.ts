import webpush from "web-push";
import type { IUser } from "../types/user.js";

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
  return /^(ExponentPushToken|ExpoPushToken)\[.+]$/.test(token.trim());
}

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/**
 * Send via Expo Push API. Logs per-ticket errors (e.g. InvalidCredentials / DeviceNotRegistered).
 * A 200 HTTP response does NOT mean every ticket succeeded — always inspect tickets.
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
        if (code === "InvalidCredentials" || code === "Unauthorized") {
          console.error(
            "→ Android FCM credentials are missing/invalid on Expo. " +
              "Run `eas credentials` → Android → Push Notifications (FCM V1) and upload your Firebase service-account JSON.",
          );
        }
      });
    } catch (e) {
      console.error("Expo push request failed:", e);
    }
  }
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

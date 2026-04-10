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

export async function sendExpoPush(
  expoTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const tokens = [...new Set(expoTokens.filter((t) => t.startsWith("ExponentPushToken")))];
  if (tokens.length === 0) return;

  const payload = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title,
    body,
    data: data ?? {},
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    // Expo accepts a single message object or an array of up to 100 messages (same project).
    body: JSON.stringify(payload.length === 1 ? payload[0] : payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Expo push failed:", res.status, text);
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

import Stripe from "stripe";

/** Keep in sync with `stripe` package default API version. */
export const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return client;
}

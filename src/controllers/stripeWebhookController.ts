import Stripe from "stripe";
import type { Request, Response } from "express";
import { getStripe } from "../config/stripe.js";
import Order from "../models/orderModel.js";
import { enqueueKitchenAssignment } from "../queues/queues.js";
import { notifyOrderParticipantsByOrderId } from "../services/orderNotifications.js";

/**
 * Stripe webhook — must use raw body (see `app.ts` middleware order).
 * When creating Checkout Sessions, set `metadata.orderId` to your Mongo order id.
 */
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).send("STRIPE_WEBHOOK_SECRET is not configured");
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (typeof sig !== "string") {
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).send("Invalid body (expected raw buffer)");
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    res
      .status(400)
      .send(`Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id ?? undefined;
        const isSettled =
          session.payment_status === "paid" || session.payment_status === "no_payment_required";
        if (orderId && isSettled) {
          await markOrderPaidFromStripe(orderId, session.id);
        } else {
          console.log("Stripe completed session not yet settled:", {
            orderId,
            sessionId: session.id,
            paymentStatus: session.payment_status,
          });
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id ?? undefined;
        if (orderId) {
          await markOrderPaidFromStripe(orderId, session.id);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id ?? undefined;
        if (orderId) {
          await Order.findByIdAndUpdate(orderId, { paymentStatus: "failed" });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    res.status(500).send("Webhook handler failed");
    return;
  }

  res.status(200).json({ received: true });
}

async function markOrderPaidFromStripe(orderId: string, stripeCheckoutSessionId: string): Promise<void> {
  const order = await Order.findById(orderId);
  if (!order) {
    return;
  }
  if (order.paymentStatus === "paid") {
    return;
  }

  const wasPendingPayment = order.status === "pending_payment";

  order.paymentStatus = "paid";
  order.stripeCheckoutSessionId = stripeCheckoutSessionId;
  if (wasPendingPayment) {
    order.status = "pending_kitchen";
  }
  await order.save();

  if (wasPendingPayment) {
    await enqueueKitchenAssignment(orderId);
    await notifyOrderParticipantsByOrderId(orderId);
  }
}

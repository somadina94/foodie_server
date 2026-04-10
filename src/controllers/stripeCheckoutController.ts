import Stripe from "stripe";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import { getStripe } from "../config/stripe.js";
import Order from "../models/orderModel.js";

import type { Request, Response, NextFunction } from "express";

function checkoutSuccessUrl(orderId: string): string {
  const base = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
  if (!base) {
    throw new AppError("STRIPE_CHECKOUT_SUCCESS_URL is not set", 500);
  }
  const withOrder = base.includes("order_id=")
    ? base
    : `${base}${base.includes("?") ? "&" : "?"}order_id=${encodeURIComponent(orderId)}`;
  if (withOrder.includes("{CHECKOUT_SESSION_ID}")) {
    return withOrder;
  }
  const sep = withOrder.includes("?") ? "&" : "?";
  return `${withOrder}${sep}session_id={CHECKOUT_SESSION_ID}`;
}

function checkoutCancelUrl(): string {
  const base = process.env.STRIPE_CHECKOUT_CANCEL_URL;
  if (!base) {
    throw new AppError("STRIPE_CHECKOUT_CANCEL_URL is not set", 500);
  }
  return base;
}

function stripeCurrency(): string {
  const c = (process.env.STRIPE_CURRENCY ?? "usd").toLowerCase();
  return c;
}

/**
 * Creates a Stripe Checkout Session for an existing order (must be `pending_payment` + unpaid).
 * Pass `paymentMethod: "stripe"` when creating the order, then call this with `{ "orderId": "..." }`.
 */
export const createCheckoutSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = req.body as { orderId?: string };
    if (!orderId) {
      return next(new AppError("orderId is required", 400));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }
    if (order.customer.toString() !== req.user!._id.toString()) {
      return next(new AppError("Access denied", 403));
    }
    if (order.status !== "pending_payment") {
      return next(
        new AppError(
          "Order is not waiting for payment (use paymentMethod: \"stripe\" when creating the order)",
          400,
        ),
      );
    }
    if (order.paymentStatus !== "unpaid") {
      return next(new AppError("Order is already paid or not payable", 400));
    }

    const currency = stripeCurrency();
    const lineItems = order.items.map((item) => ({
      price_data: {
        currency,
        unit_amount: Math.round(item.price * 100),
        product_data: {
          name: item.name,
        },
      },
      quantity: item.quantity,
    }));

    if (order.deliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency,
          unit_amount: Math.round(order.deliveryFee * 100),
          product_data: {
            name: "Delivery fee",
          },
        },
        quantity: 1,
      });
    }

    let session: Stripe.Checkout.Session;
    try {
      const stripe = getStripe();
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: order._id.toString(),
        line_items: lineItems,
        success_url: checkoutSuccessUrl(order._id.toString()),
        cancel_url: checkoutCancelUrl(),
        metadata: {
          orderId: order._id.toString(),
        },
        customer_email: req.user!.email,
      });
    } catch (err) {
      console.error("Stripe Checkout Session create failed:", err);
      return next(
        new AppError(
          err instanceof Error ? err.message : "Could not create Checkout Session",
          502,
        ),
      );
    }

    if (!session.url) {
      return next(new AppError("Stripe did not return a checkout URL", 502));
    }

    res.status(200).json({
      status: "success",
      data: {
        url: session.url,
        sessionId: session.id,
      },
    });
  },
);

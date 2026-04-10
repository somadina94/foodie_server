import express from "express";
import cors from "cors";
import AppError from "./utils/appError.js";
import globalErrorHandler from "./controllers/errorController.js";
import { stripeWebhook } from "./controllers/stripeWebhookController.js";
import userRoutes from "./routes/userRoutes.js";
import mealRoutes from "./routes/mealRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

import type { Request, Response, NextFunction } from "express";

const app = express();

app.use(cors());

// Stripe webhooks require the raw body for signature verification (must be before express.json()).
app.post(
  "/api/v1/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    void stripeWebhook(req, res).catch(next);
  },
);

app.use(express.json());

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/meals", mealRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/stripe", stripeRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;

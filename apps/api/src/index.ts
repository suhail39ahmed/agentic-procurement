import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { paypalWebhookRouter } from "./webhooks/paypal";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/webhooks/paypal", webhookLimiter, paypalWebhookRouter);

app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
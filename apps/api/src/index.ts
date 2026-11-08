import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { paypalWebhookRouter } from "./webhooks/paypal";
import { auditRouter } from "./audit";
import { negotiationsRouter } from "./negotiations";
import { checkoutRouter } from "./checkout";
import { assistantRouter } from "./assistant";
import { assertMandateSecret, assertSandboxOnly } from "./security";

assertSandboxOnly();
assertMandateSecret();

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

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

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const negotiationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", paypalEnv: "sandbox" });
});

app.use("/api/webhooks/paypal", webhookLimiter, paypalWebhookRouter);
app.use("/api", apiLimiter);
app.use("/api/audit", auditRouter);
app.use("/api/negotiations", negotiationLimiter, negotiationsRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api", checkoutRouter);
app.listen(port, "0.0.0.0", () => {
  console.log(`[api] listening on http://0.0.0.0:${port} (sandbox-only)`);
});
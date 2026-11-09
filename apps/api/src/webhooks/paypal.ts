import { Router, type Request, type Response } from "express";
import { verifyWebhook } from "./verify";
import { applyWebhookEvent, listLedger, listDisputes, listEvents, type PayPalWebhookEvent } from "agents";
import { applyPaymentSignal, signalFromPaypalEventType } from "../sponsors/schedule-agent";

type PayPalEvent = PayPalWebhookEvent & { create_time: string };

export const paypalWebhookRouter = Router();

paypalWebhookRouter.post("/", async (req: Request, res: Response) => {
  const event = req.body as PayPalEvent;

  try {
    const valid = await verifyWebhook(
      {
        transmissionId: req.header("paypal-transmission-id") ?? "",
        transmissionTime: req.header("paypal-transmission-time") ?? "",
        certUrl: req.header("paypal-cert-url") ?? "",
        authAlgo: req.header("paypal-auth-algo") ?? "",
        transmissionSig: req.header("paypal-transmission-sig") ?? "",
      },
      event,
    );

    if (!valid) {
      console.warn(`[webhook] rejected ${event.id}`);
      return res.sendStatus(400);
    }

    const entry = await applyWebhookEvent(event);
    const isNew = entry.outcome !== "SKIPPED" || entry.reason !== "event already processed";
    console.log(
      `[webhook] ${isNew ? "accepted" : "duplicate"} ${event.event_type} ${event.resource?.id ?? ""} ${event.resource?.status ?? ""}`,
    );
    console.log(`[ledger] ${entry.outcome} ${entry.orderId ?? "-"} ${entry.reason}`);

    if (isNew) {
      const signal = signalFromPaypalEventType(event.event_type);
      if (signal) {
        applyPaymentSignal(signal, {
          orderId: entry.orderId ?? event.resource?.id,
          eventType: event.event_type,
        });
        console.log(`[bryntum-agent] rescheduled for ${event.event_type} → ${signal}`);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("[webhook] error", err);
    return res.sendStatus(500);
  }
});

paypalWebhookRouter.get("/", async (req: Request, res: Response) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.header("x-admin-key") !== adminKey) {
    return res.sendStatus(404);
  }
  return res.json({
    events: await listEvents(),
    ledger: await listLedger(),
    disputes: await listDisputes(),
  });
});

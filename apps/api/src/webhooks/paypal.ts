import { Router, type Request, type Response } from "express";
import { verifyWebhook } from "./verify";
import { saveEvent, listEvents } from "./store";

type PayPalEvent = {
  id: string;
  event_type: string;
  create_time: string;
  resource?: { id?: string; status?: string };
};

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
      event
    );

    if (!valid) {
      console.warn(`[webhook] rejected ${event.id}`);
      return res.sendStatus(400);
    }

    const isNew = saveEvent({
      id: event.id,
      eventType: event.event_type,
      createTime: event.create_time,
      raw: event,
      receivedAt: new Date().toISOString(),
    });

    console.log(
      `[webhook] ${isNew ? "accepted" : "duplicate"} ${event.event_type} ${event.resource?.id ?? ""} ${event.resource?.status ?? ""}`
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error("[webhook] error", err);
    return res.sendStatus(500);
  }
});

paypalWebhookRouter.get("/", (req: Request, res: Response) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.header("x-admin-key") !== adminKey) {
    return res.sendStatus(404);
  }
  return res.json(listEvents());
});

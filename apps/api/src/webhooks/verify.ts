import { paypalRequest } from "../../../../packages/paypal/src/client";

export type WebhookHeaders = {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
};

export async function verifyWebhook(
  headers: WebhookHeaders,
  event: unknown
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set");

  const result = await paypalRequest<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime,
        transmission_sig: headers.transmissionSig,
        webhook_id: webhookId,
        webhook_event: event,
      },
    }
  );

  return result.verification_status === "SUCCESS";
}
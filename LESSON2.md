# Lesson 2: Let PayPal tell us when money moves (webhooks)

In Lesson 1 *we* asked PayPal for things. In this lesson PayPal starts **calling us**. Whenever money is held, captured or released, PayPal sends a small message (a **webhook**) to a URL we own. Our ledger and dashboard will update from these messages (issue #6).

Time needed: about 30 minutes.

---

## Step 1. What the code does

Open `apps/api/src/webhooks/paypal.ts`. For every message arriving at **`POST /api/webhooks/paypal`**, it does four things:

1. **Reads** the JSON event, for example `PAYMENT.CAPTURE.COMPLETED`.
2. **Skips duplicates.** PayPal retries until we answer 200, so the same event can arrive twice. Each event has a unique `id`. If we've already stored it, we just say 200 again.
3. **Verifies the signature.** Anyone on the internet could POST to our URL pretending to be PayPal. So we send PayPal's signature headers (`paypal-transmission-id`, `-sig`, `-time`, `-cert-url`, `-auth-algo`) together with our `PAYPAL_WEBHOOK_ID` to PayPal's `POST /v1/notifications/verify-webhook-signature`. We trust the event only if PayPal answers `SUCCESS`.
   - Fake or invalid → **401**, and the event is not stored.
   - PayPal unreachable → **503**, so PayPal retries later.
4. **Stores and logs** the event in `apps/api/data/webhook_events.jsonl` (gitignored), then answers **200**.

This file is a stand-in. Postgres replaces it in issue #2.

---

## Step 2. Start the API

```bash
pnpm install
pnpm dev:api        # api on http://localhost:4000
```
Check it in a second terminal:
```bash
curl localhost:4000/health
# {"ok":true,"env":"sandbox","webhookIdSet":false}   <- false until Step 4
```

---

## Step 3. Give your laptop a public URL (tunnel)

PayPal lives on the internet and can't reach `localhost`. A **tunnel** gives port **4000** a public HTTPS address. Pick one:

**Option A, localtunnel (no account):**
```bash
pnpm tunnel            # = npx localtunnel --port 4000
# your url is: https://quick-fox-12.loca.lt
```
**Option B, ngrok (more stable, free account):**
```bash
ngrok http 4000
# Forwarding https://ab12-34.ngrok-free.app -> http://localhost:4000
```
Your webhook URL is the tunnel address **plus `/api/webhooks/paypal`**, for example `https://quick-fox-12.loca.lt/api/webhooks/paypal`.

Keep this terminal open. If the tunnel restarts you get a new URL, and you'll need to update the webhook in Step 4.

---

## Step 4. Register the webhook on your sandbox app

1. Go to https://developer.paypal.com/dashboard/applications/sandbox → open **agentic-procurement**.
2. Scroll to **Sandbox Webhooks** → **Add Webhook**.
3. **Webhook URL:** your tunnel URL plus `/api/webhooks/paypal`.
4. Tick these events:
   - `CHECKOUT.ORDER.APPROVED`
   - `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`
   - `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`
   - `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`
   - `INVOICING.INVOICE.PAID`, `PAYMENT.PAYOUTSBATCH.SUCCESS`
   (Or choose "All events" while learning.)
5. **Save.** PayPal shows a **Webhook ID** (looks like `8PT597110X687430LKGECATA`).
6. Put it in your local `.env` (never commit):
   ```
   PAYPAL_WEBHOOK_ID=<the Webhook ID>
   ```
7. Restart `pnpm dev:api`. `/health` should now say `"webhookIdSet":true`.

---

## Step 5. Make PayPal send real events

In a third terminal, rerun Lesson 1's spike:
```bash
pnpm spike:paypal -- --void     # hold then release; pays OUR merchant, so our app gets the payment events
pnpm spike:paypal               # hold then capture to seller-a
```
After you approve as owner-buyer, watch the API terminal:
```
[webhook] VERIFIED CHECKOUT.ORDER.APPROVED event=WH-... resource=9M74... status=APPROVED (stored: 1)
[webhook] VERIFIED PAYMENT.AUTHORIZATION.CREATED event=WH-... resource=6NL0... status=CREATED (stored: 2)
[webhook] VERIFIED PAYMENT.AUTHORIZATION.VOIDED  event=WH-... resource=6NL0... status=VOIDED  (stored: 3)
```
Events can take a few seconds to a minute to arrive in sandbox.

**Heads-up:** payment events usually go to the **payee's** apps. For the capture run, seller-a is the payee, so your app may only receive `CHECKOUT.ORDER.APPROVED` for it. That's expected (this is an assumption we'll confirm while testing), and it's the same reason the void fix in Lesson 1 pays our own merchant.

---

## Step 6. Confirm the 200s

- **Your terminal:** `VERIFIED …` lines means a 200 was returned.
- **PayPal:** Dashboard → **Testing Tools → Webhooks Events** (https://developer.paypal.com/dashboard/webhooks) lists each delivery with its HTTP status. You want **200**. A row marked failed or retrying means the tunnel was down or the URL path was wrong.
- **The stored file:** `cat apps/api/data/webhook_events.jsonl | wc -l`
- **Security check:** prove a fake is rejected:
  ```bash
  curl -i -X POST localhost:4000/api/webhooks/paypal -H 'content-type: application/json' \
    -H 'paypal-transmission-id: fake' -H 'paypal-transmission-sig: fake' -d '{"id":"WH-FAKE","event_type":"PAYMENT.CAPTURE.COMPLETED"}'
  # HTTP/1.1 401  {"error":"invalid signature"}
  ```

**Gotcha:** the dashboard's **Webhooks Simulator** sends mock events that are *not* signed for your webhook ID, so they will get 401. That's correct behaviour. Use real spike runs instead.

**Troubleshooting**
- 404 in the PayPal dashboard: the URL is missing `/api/webhooks/paypal`.
- 500 `PAYPAL_WEBHOOK_ID not set`: fill in `.env` and restart.
- Everything is 401 for real events: the Webhook ID in `.env` belongs to a different webhook or app, or the tunnel URL changed. Re-copy the ID.
- localtunnel says "503 Tunnel Unavailable": restart `pnpm tunnel` and update the webhook URL.

---

## What you learned
- A webhook is PayPal calling *us*. We **verify** it, **dedupe** it by event id, **store** it, then answer 200 fast.
- Retries plus idempotency mean we never double-count money.

**Next: Lesson 2b. Connect your Azure AI Foundry gateway (issue #7)** so the agents can think: model routing for buyer, seller and judge, plus logging and token budgets.

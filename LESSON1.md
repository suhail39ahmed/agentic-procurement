# Lesson 1: The skeleton, and your first PayPal sandbox payment

Welcome! By the end of this lesson you will have moved (pretend) money through PayPal: you'll **hold** it, then **capture** it or **release** it. That single flow is the core of our whole hackathon project, so it's a great first win.

Time needed: about 45 minutes.

---

## Step 1. What we just scaffolded (and why)

Think of the repo as a small company with departments:

| Folder | What it is | Analogy |
|---|---|---|
| `apps/web` | The website (Next.js). Later it gets the chat box and the AG Grid tables. | The shop front |
| `apps/api` | The backend server (Node + TypeScript). It runs the agents and receives PayPal's notifications. | The back office |
| `packages/paypal` | The code that talks to PayPal: logging in, creating orders, holding and capturing money. | The finance desk |
| `packages/agents` | The buyer and seller AI agents and the rules they must follow. | The purchasing team |
| `packages/db` | The database tables (our ledger). | The filing cabinet |
| `evals/` | Tests that score how well the agents negotiate. | The auditor |

It's one repo holding several packages, which is called a **monorepo**. **pnpm workspaces** connect the packages so `apps/api` can import `@ap/paypal`.

Open `packages/paypal/src/client.ts` and look for these four functions. They're the heart of today's lesson:
1. `accessToken()` logs in to PayPal with your app's ID and secret, and caches the token (it lasts a few hours).
2. `createAuthorizeOrder()` creates an order that will **hold** money (`intent: "AUTHORIZE"`).
3. `authorizeOrder()` places the hold after the buyer approves.
4. `captureAuthorization()` / `voidAuthorization()` either take the money or release the hold. These use **Payments v2**, a different PayPal API from Orders.

Each request carries a `PayPal-Request-Id` header. If the same request is accidentally sent twice, PayPal does it **once**, so we never double-charge anyone. This is called *idempotency*.

---

## Step 2. Create a PayPal sandbox REST app

The **sandbox** is PayPal's practice world: real APIs, fake money.

1. Go to https://developer.paypal.com and log in with your normal PayPal account (or sign up, it's free).
2. Open **Dashboard → Apps & Credentials**, https://developer.paypal.com/dashboard/applications/sandbox
3. Make sure the toggle at the top says **Sandbox**, not Live.
4. Click **Create App**. Name it `agentic-procurement`, type **Merchant**, then click **Create App**.
5. You'll now see a **Client ID** and a **Secret** (click "Show"). Keep this tab open, we'll use them in Step 4.
6. Scroll down to **Features** (sometimes labelled *Sandbox App Settings*). Tick **Payouts** and **Invoicing** (plus Accept payments, which is usually on already). Click **Save**.

Payouts might need approval or say "request access". That's fine for today, because we only need it later (issue #35).

---

## Step 3. Create 6 sandbox accounts

Go to **Dashboard → Testing Tools → Sandbox Accounts**, https://developer.paypal.com/dashboard/accounts, then click **Create account** for each one:

| # | Type | Name it | Plays the role of |
|---|---|---|---|
| 1 | Business | `owner-buyer` | You, the small-business owner who **pays** |
| 2 | Business | `seller-a` | Seller agent A (anchorer) |
| 3 | Business | `seller-b` | Seller agent B (bundler) |
| 4 | Business | `seller-c` | Seller agent C (cheap but slow) |
| 5 | Business | `seller-d` | Seller agent D (premium, fast) |
| 6 | Personal | `client` | A customer you **invoice** |

Tips:
- Give the buyer a healthy balance (for example $5,000), since it does the paying.
- Click the **⋯** menu → **View/edit account** to see each account's email and password. You'll log in as `owner-buyer` to approve payments.
- Write the **emails** (not passwords) of seller-a to seller-d somewhere handy. Those emails are what tell PayPal who gets paid (the `payee`).

---

## Step 4. Put your credentials in `.env` (and never commit it)

```bash
cd agentic-procurement
cp .env.example .env
```
Open `.env` and fill in:
```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=<Client ID from Step 2>
PAYPAL_CLIENT_SECRET=<Secret from Step 2>
SPIKE_SELLER_EMAIL=<seller-a sandbox email>
```
**Golden rule:** `.env` is listed in `.gitignore`, so git ignores it. Never paste secrets into code, issues, chat prompts or commits. Before any commit, run `git status` and check that `.env` does **not** appear.

---

## Step 5. Your first hold → capture → release test

You need Node 20+ (`node -v` tells you which you have).

```bash
corepack enable
pnpm install
pnpm spike:paypal
```

What happens, step by step:
1. The script logs in and creates a **$25 order** to seller-a, then prints a link.
2. Open the link and log in as **owner-buyer**, then approve. (PayPal always lets the payer say yes. Our agent will never spend without that approval, which is a big part of our trust story.)
3. Back in the terminal, press **Enter**. The script **authorizes**: the money is now *held*, not taken. Note the authorization ID.
4. It then **captures**: the money actually moves. You'll see `Captured: <id> COMPLETED`.

Now try the "something went wrong" path:
```bash
pnpm spike:paypal -- --void
```
This time, after the hold, it **voids**, so the money is released and nobody is charged. That's exactly what our agent will do when a seller misses a delivery.

**Check your work.** Log in at https://www.sandbox.paypal.com as `owner-buyer` and as `seller-a`. You should see a completed $25 payment from the first run and a voided authorization from the second.

**If `corepack enable` fails** (permission error), skip it and use `npx pnpm@9.12.0 install` and `npx pnpm@9.12.0 spike:paypal`. Or install pnpm once with `npm i -g pnpm@9`.

**Quick check before real credentials:** with blank values in `.env`, the script stops with "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET". That means everything is wired up correctly and it's only waiting for your keys.

**If something fails:**
- `401` / OAuth failed: the ID or secret is wrong, or the dashboard was set to Live. Re-copy them from the Sandbox app.
- `PAYEE_ACCOUNT_INVALID`: `SPIKE_SELLER_EMAIL` doesn't match a sandbox business account.
- `Set SPIKE_SELLER_EMAIL`: add seller-a's sandbox email to `.env`.
- `ORDER_NOT_APPROVED`: you pressed Enter before approving in the browser.

---

## What you learned
- **Authorize = hold, capture = take, void = release.** This is our "escrow".
- Idempotency keys keep payments from happening twice.
- The sandbox gives you fake buyers and sellers to rehearse with.

**Next lesson:** a webhook receiver, so PayPal *tells us* when money moves (issue #6), and wiring your Azure AI gateway (#7).

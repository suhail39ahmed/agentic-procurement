// Issue #5 spike: create (AUTHORIZE) -> payer approves -> authorize -> capture OR void.
// Usage: pnpm spike:paypal            (capture path)
//        pnpm spike:paypal -- --void  (void path)
import { createInterface } from "node:readline/promises";
import { clientFromEnv } from "../src/index.js";

const pp = clientFromEnv();
const doVoid = process.argv.includes("--void");
const poId = `spike-${Date.now()}`;
const payee = process.env.SPIKE_SELLER_EMAIL; // a sandbox merchant (seller) account email
// Void needs the payee to be OUR app merchant (third-party payee -> 403 PERMISSION_DENIED on void).
// So the --void path pays the platform merchant; the capture path pays seller-a directly.
const payeeEmail = doVoid ? undefined : payee;
if (!doVoid && !payee) throw new Error("Set SPIKE_SELLER_EMAIL in .env to your seller-a sandbox email (LESSON1 Step 4)");

const order = await pp.createAuthorizeOrder({ poId, amount: { currency_code: "USD", value: "25.00" }, payeeEmail, description: "Spike: 10 shipping boxes" });
const approve = order.links.find((l: any) => l.rel === "payer-action" || l.rel === "approve")?.href;
console.log("Order", order.id, "status", order.status);
console.log("Open this link and log in with your SANDBOX BUYER account to approve:\n", approve);

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Press Enter after approving... "); rl.close();

const auth = await pp.authorizeOrder(order.id, poId);
const authorizationId = auth.purchase_units[0].payments.authorizations[0].id;
console.log("Authorized (funds held):", authorizationId);

if (doVoid) console.log("Voided:", await pp.voidAuthorization(authorizationId, poId));
else { const cap = await pp.captureAuthorization(authorizationId, poId); console.log("Captured:", cap.id, cap.status); }

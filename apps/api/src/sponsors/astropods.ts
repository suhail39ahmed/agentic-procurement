/** Astropods-style agent registry (governance inventory for the dual-track demo). */
export function agentRegistry() {
  return {
    workspace: process.env.ASTROPODS_WORKSPACE ?? "procureai-local",
    configured: Boolean(process.env.ASTROPODS_WORKSPACE?.trim()),
    note: "Agent inventory mapped for Astropods-style governance (scopes, human gates, spend caps).",
    agents: [
      {
        id: "buyer-negotiator",
        track: "marketplace",
        role: "Buyer agent",
        scopes: ["rfq.fanout", "negotiate", "score"],
        humanGate: "Policy REQUIRE_APPROVAL + signed mandate before PayPal",
        spendCap: "DEMO_MAX_USD (default $2) + policy max order total",
      },
      {
        id: "seller-agents",
        track: "marketplace",
        role: "Seller agents (A–D / micro)",
        scopes: ["offer", "counter"],
        humanGate: "None — cannot move money",
        spendCap: "n/a",
      },
      {
        id: "invoice-extractor",
        track: "payables",
        role: "LLM invoice extractor",
        scopes: ["invoice.extract"],
        humanGate: "Owner reviews match before payout",
        spendCap: "DEMO_MAX_USD on extract + payout",
      },
      {
        id: "buying-assistant",
        track: "both",
        role: "PayPal Agent Toolkit assistant",
        scopes: ["invoices", "disputes.list", "orders.get"],
        humanGate: "accept_dispute_claim requires explicit owner approval API",
        spendCap: "Toolkit create_invoice capped by DEMO_MAX_USD",
      },
      {
        id: "replenishment-worker",
        track: "payables",
        role: "Low-stock rule evaluator",
        scopes: ["replenish.evaluate", "negotiation.queue"],
        humanGate: "Owner still approves PayPal authorize/capture",
        spendCap: "Queued RFQ still under DEMO_MAX_USD",
      },
    ],
  };
}

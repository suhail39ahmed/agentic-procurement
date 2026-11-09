import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

export type ToolkitMode = "assistant" | "owner";

function requirePayPalCreds() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for Agent Toolkit");
  }
  if ((process.env.PAYPAL_ENV ?? "sandbox").toLowerCase() === "live") {
    throw new Error("PayPal Agent Toolkit is sandbox-only in this app");
  }
  return { clientId, clientSecret };
}

/** Read-only / create-invoice tools for the buying assistant (no dispute accept). */
const ASSISTANT_ACTIONS = {
  invoices: {
    create: true,
    list: true,
    get: true,
    send: true,
    sendReminder: true,
    generateInvoiceNumber: true,
    search: true,
  },
  orders: { get: true },
  disputes: { list: true, get: true },
  shipment: { create: true, show: true },
  transactions: { list: true },
  insights: { get: true },
  products: { list: true },
};

/** Owner-gated toolkit including accept_dispute_claim (toolkit maps that to disputes.create). */
const OWNER_ACTIONS = {
  ...ASSISTANT_ACTIONS,
  disputes: { list: true, get: true, create: true },
  payments: { createRefund: true, getRefunds: true },
};

const cache = new Map<ToolkitMode, PayPalAgentToolkit>();

export function getPayPalToolkit(mode: ToolkitMode = "assistant"): PayPalAgentToolkit {
  const existing = cache.get(mode);
  if (existing) return existing;
  const { clientId, clientSecret } = requirePayPalCreds();
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: mode === "owner" ? OWNER_ACTIONS : ASSISTANT_ACTIONS,
      context: { sandbox: true },
    },
  });
  cache.set(mode, toolkit);
  return toolkit;
}

export async function runPayPalTool(
  method: string,
  args: Record<string, unknown> = {},
  mode: ToolkitMode = "assistant",
): Promise<string> {
  const toolkit = getPayPalToolkit(mode);
  const toolCall = {
    id: `local_${method}_${Date.now()}`,
    type: "function",
    function: {
      name: method,
      arguments: JSON.stringify(args ?? {}),
    },
  } as ChatCompletionMessageToolCall;
  const result = await toolkit.handleToolCall(toolCall);
  return typeof result.content === "string" ? result.content : JSON.stringify(result.content);
}

export function parseToolJson<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return { raw } as T;
  }
}

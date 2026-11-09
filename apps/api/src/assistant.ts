import { Router } from "express";
import { chatWithTools, type ChatMessage, type ToolCall } from "ai";
import { getPayPalToolkit } from "./paypal-toolkit";

export const assistantRouter = Router();

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = [
  "You are ProcureAI's buying assistant in a compact chat panel (not a report writer).",
  "",
  "REPLY STYLE (match the UI):",
  "- Default: 2–4 short sentences OR up to 5 short bullets. Hard cap ~80 words unless the user asks for detail.",
  "- Lead with the answer / recommendation. No preamble, no essay, no 'Here's the current…'.",
  "- Plain text only. No markdown tables, no ### headings, no long numbered menus.",
  "- Do not dump every seller. Mention the winner + at most one runner-up tradeoff.",
  "- One optional follow-up question max. Never offer a 1/2/3 menu unless asked.",
  "- Money in USD. Use everyday words (eligible = meets budget + deadline).",
  "",
  "WHEN COMPARING OFFERS:",
  "- Say who to pick and why in one line (price + lead time + eligible).",
  "- If others are ineligible, one short reason (e.g. 'seller-c cheaper but misses deadline').",
  "- Skip score dumps unless the user asks for scores.",
  "",
  "PAYPAL / TOOLS:",
  "- You may call PayPal Agent Toolkit tools for sandbox invoices, order lookup, dispute list/get, shipments, transactions.",
  "- Never call accept_dispute_claim — that needs a separate owner-approved API action.",
  "- Never claim you can capture procurement holds; owner confirms delivery first.",
  "- For client invoicing: create_invoice then send_invoice when asked.",
  "- After tools: summarize the result in 1–3 short lines, not a dump of JSON.",
].join("\n");

assistantRouter.post("/chat", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: "message must be 1..2000 characters" });
  }

  const history = Array.isArray(req.body?.history) ? (req.body.history as ChatTurn[]) : [];
  const safeHistory = history
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .slice(-8)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));

  const context = typeof req.body?.context === "string" ? req.body.context.trim().slice(0, 4000) : "";

  try {
    const toolkit = getPayPalToolkit("assistant");
    const tools = toolkit.getTools();

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: context
          ? `${SYSTEM_PROMPT}\n\nWorkspace snapshot (use silently; do not restate the whole blob):\n${context}`
          : SYSTEM_PROMPT,
      },
      ...safeHistory.map((turn) => ({ role: turn.role as "user" | "assistant", content: turn.content })),
      { role: "user", content: message },
    ];

    const result = await chatWithTools(
      "buyer",
      messages,
      tools,
      async (call: ToolCall) => {
        const toolResult = await toolkit.handleToolCall(call);
        return typeof toolResult.content === "string"
          ? toolResult.content
          : JSON.stringify(toolResult.content);
      },
      { maxSteps: 5, timeoutMs: 90_000 },
    );

    let reply = (result.content || (result.toolTrace.length
      ? `Done: ${result.toolTrace.map((t) => t.name).join(", ")}.`
      : "No reply generated.")).trim();

    // Soft trim runaway markdown reports if the model ignores style rules.
    if (reply.includes("|---") || reply.includes("### ")) {
      reply = reply
        .split("\n")
        .filter((line) => !line.includes("|---") && !/^#{1,3}\s/.test(line.trim()) && !/^\|/.test(line.trim()))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    return res.json({
      reply,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      toolkitSteps: result.steps,
      toolkitTrace: result.toolTrace,
      toolkit: "paypal-agent-toolkit/openai",
    });
  } catch (err) {
    console.error("[assistant] chat failed", err);
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

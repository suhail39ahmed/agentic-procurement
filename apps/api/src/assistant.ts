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
        content: [
          "You are ProcureAI's buying assistant for an owner-controlled procurement workspace.",
          "You can call PayPal Agent Toolkit tools for sandbox invoices, order lookup, dispute list/get, shipments, and transactions.",
          "Never call accept_dispute_claim — that requires a separate owner-approved API action.",
          "Never claim you can capture procurement holds yourself. Owner confirms delivery before capture.",
          "For client invoicing, prefer create_invoice then send_invoice when the user asks to bill a sandbox client.",
          "Keep answers concise. Prefer USD and clear next steps.",
          context ? `Current workspace context:\n${context}` : "",
        ].filter(Boolean).join("\n"),
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

    return res.json({
      reply: result.content || (result.toolTrace.length
        ? `Completed PayPal Toolkit steps: ${result.toolTrace.map((t) => t.name).join(", ")}`
        : "No reply generated."),
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

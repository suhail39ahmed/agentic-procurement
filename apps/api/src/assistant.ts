import { Router } from "express";
import { chat } from "ai";

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
    const result = await chat("buyer", [
      {
        role: "system",
        content: [
          "You are ProcureAI's buying assistant for an owner-controlled procurement workspace.",
          "Help clarify requirements, compare supplier trade-offs, and explain authorize-then-capture payments.",
          "Never claim you can capture PayPal funds yourself. Owner must confirm delivery before capture.",
          "Keep answers concise and practical. Prefer USD and clear next steps.",
          context ? `Current workspace context:\n${context}` : "",
        ].filter(Boolean).join("\n"),
      },
      ...safeHistory.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: message },
    ]);

    return res.json({
      reply: result.content,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.error("[assistant] chat failed", err);
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

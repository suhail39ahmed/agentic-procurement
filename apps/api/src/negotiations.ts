import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  createNegotiation,
  findNegotiationByIdempotency,
  getNegotiationForOwner,
  listNegotiationsForOwner,
  updateNegotiationRun,
  type NegotiationPriority,
} from "db";
import { scheduleNegotiationRun } from "./run-negotiation";

export const negotiationsRouter = Router();

type CreateBody = {
  brief?: unknown;
  priority?: unknown;
  quantity?: unknown;
  maxUnitPrice?: unknown;
  currency?: unknown;
  neededByDays?: unknown;
  idempotencyKey?: unknown;
};

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

function validateCreate(body: CreateBody):
  | { ok: true; value: {
      brief: string;
      priority: NegotiationPriority;
      quantity: number;
      maxUnitPrice: number;
      currency: "USD";
      neededByDays: number;
      idempotencyKey: string;
    } }
  | { ok: false; error: string } {
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (!brief || brief.length > 500) return { ok: false, error: "brief must be 1..500 characters" };

  const priority = body.priority;
  if (priority !== "price" && priority !== "speed" && priority !== "balanced") {
    return { ok: false, error: "priority must be price, speed, or balanced" };
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
    return { ok: false, error: "quantity must be an integer from 1 to 10000" };
  }

  const maxUnitPrice = Number(body.maxUnitPrice);
  if (!Number.isFinite(maxUnitPrice) || maxUnitPrice <= 0 || maxUnitPrice > 1_000_000) {
    return { ok: false, error: "maxUnitPrice must be > 0 and <= 1000000" };
  }
  if (typeof body.maxUnitPrice === "string" && !/^\d+(\.\d{1,2})?$/.test(body.maxUnitPrice.trim())) {
    return { ok: false, error: "maxUnitPrice must use up to 2 decimal places" };
  }
  if (typeof body.maxUnitPrice === "number" && !Number.isInteger(Math.round(maxUnitPrice * 100))) {
    return { ok: false, error: "maxUnitPrice must use up to 2 decimal places" };
  }

  if (body.currency !== "USD") return { ok: false, error: "currency must be USD" };

  const neededByDays = Number(body.neededByDays);
  if (!Number.isInteger(neededByDays) || neededByDays < 1 || neededByDays > 365) {
    return { ok: false, error: "neededByDays must be an integer from 1 to 365" };
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return { ok: false, error: "idempotencyKey must be 1..128 characters" };
  }

  return {
    ok: true,
    value: {
      brief,
      priority,
      quantity,
      maxUnitPrice: Math.round(maxUnitPrice * 100) / 100,
      currency: "USD",
      neededByDays,
      idempotencyKey,
    },
  };
}

negotiationsRouter.post("/", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = validateCreate(req.body as CreateBody);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const existing = await findNegotiationByIdempotency(ownerId, parsed.value.idempotencyKey);
    if (existing) {
      return res.status(200).json({
        id: existing.id,
        status: existing.status,
        createdAt: existing.createdAt,
        idempotent: true,
      });
    }

    const created = await createNegotiation({
      id: randomUUID(),
      ownerId,
      idempotencyKey: parsed.value.idempotencyKey,
      status: "QUEUED",
      brief: parsed.value.brief,
      priority: parsed.value.priority,
      quantity: parsed.value.quantity,
      maxUnitPriceDollars: parsed.value.maxUnitPrice,
      currency: parsed.value.currency,
      neededByDays: parsed.value.neededByDays,
    });

    scheduleNegotiationRun(ownerId, created.id);

    return res.status(201).json({
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
      idempotent: false,
      started: true,
    });
  } catch (err) {
    const existing = await findNegotiationByIdempotency(ownerId, parsed.value.idempotencyKey).catch(() => undefined);
    if (existing) {
      return res.status(200).json({
        id: existing.id,
        status: existing.status,
        createdAt: existing.createdAt,
        idempotent: true,
      });
    }
    console.error("[negotiations] create failed", err);
    return res.sendStatus(500);
  }
});

negotiationsRouter.get("/", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    const rows = await listNegotiationsForOwner(ownerId);
    return res.json({
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        brief: row.brief,
        priority: row.priority,
        quantity: row.quantity,
        maxUnitPrice: row.maxUnitPrice,
        currency: row.currency,
        neededByDays: row.neededByDays,
        workflowRunId: row.workflowRunId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[negotiations] list failed", err);
    return res.sendStatus(500);
  }
});

negotiationsRouter.get("/:id", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    const row = await getNegotiationForOwner(ownerId, req.params.id);
    if (!row) return res.sendStatus(404);

    return res.json({
      id: row.id,
      status: row.status,
      brief: row.brief,
      priority: row.priority,
      quantity: row.quantity,
      maxUnitPrice: row.maxUnitPrice,
      currency: row.currency,
      neededByDays: row.neededByDays,
      workflowRunId: row.workflowRunId ?? null,
      result: row.result ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    console.error("[negotiations] get failed", err);
    return res.sendStatus(500);
  }
});

negotiationsRouter.post("/:id/start", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    const row = await getNegotiationForOwner(ownerId, req.params.id);
    if (!row) return res.sendStatus(404);
    if (row.status !== "QUEUED" && row.status !== "FAILED") {
      return res.status(409).json({
        error: `Cannot start from status ${row.status}`,
        id: row.id,
        status: row.status,
      });
    }

    if (row.status === "FAILED") {
      await updateNegotiationRun({
        id: row.id,
        ownerId,
        status: "QUEUED",
        error: null,
        result: null,
        workflowRunId: null,
      });
    }

    scheduleNegotiationRun(ownerId, row.id);
    return res.status(202).json({ id: row.id, status: "QUEUED", accepted: true });
  } catch (err) {
    console.error("[negotiations] start failed", err);
    return res.sendStatus(500);
  }
});
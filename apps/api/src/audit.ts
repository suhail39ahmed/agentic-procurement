import { Router } from "express";
import { getOrder, readAuditChain, verifyAuditChain } from "agents";

export const auditRouter = Router();

auditRouter.get("/:orderId/verify", async (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.header("x-admin-key") !== adminKey) {
    return res.sendStatus(404);
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Audit database unavailable" });
    }

    const order = await getOrder(req.params.orderId);
    if (!order) return res.sendStatus(404);

    const records = await readAuditChain(order.id);
    return res.json({
      orderId: order.id,
      recordCount: records.length,
      valid: records.length ? verifyAuditChain(records) : null,
      records,
    });
  } catch (err) {
    console.error("[audit] verification failed", err);
    return res.sendStatus(500);
  }
});
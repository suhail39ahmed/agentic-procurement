import assert from "node:assert/strict";
import {
  createAuditRecord,
  verifyAuditChain,
} from "../orders/audit";

const first = createAuditRecord({
  orderId: "audit-test",
  event: "CREATED",
  actor: "buyer",
  at: "2026-11-08T00:00:00.000Z",
});

const second = createAuditRecord({
  orderId: "audit-test",
  event: "APPROVED",
  actor: "owner",
  at: "2026-11-08T00:01:00.000Z",
  from: "DRAFT",
  to: "APPROVED",
  note: "Approved by owner",
}, first);

assert.equal(verifyAuditChain([first, second]), true);
assert.equal(
  verifyAuditChain([{ ...first, actor: "intruder" }, second]),
  false,
);
assert.equal(verifyAuditChain([second]), false);
assert.equal(verifyAuditChain([second, first]), false);
assert.equal(
  verifyAuditChain([first, { ...second, to: "CAPTURED" }]),
  false,
);
assert.equal(
  verifyAuditChain([first, { ...second, note: "Changed note" }]),
  false,
);

console.log("All audit checks passed");
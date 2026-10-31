// Buyer + seller agents, negotiation protocol (zod) and policy engine. Issues #9-#14, #18, #20.
export type MessageType = "OFFER" | "COUNTER" | "ACCEPT" | "REJECT";
export interface Line { sku: string; qty: number; unit_price: number }
export interface NegotiationMessage { type: MessageType; negotiation_id: string; round: number; lines: Line[]; total: number; currency: string; delivery_date: string; valid_until?: string; mandate?: string; rationale?: string }

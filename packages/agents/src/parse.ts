import { NegotiationMessage } from "./protocol";

export type ParseResult =
  | { ok: true; message: NegotiationMessage }
  | { ok: false; error: string };

export function parseMessage(raw: string, expected: NegotiationMessage["type"][]): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Model output is not valid JSON" };
  }

  const result = NegotiationMessage.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `Schema validation failed: ${issues}` };
  }

  if (!expected.includes(result.data.type)) {
    return { ok: false, error: `Unexpected message type ${result.data.type}` };
  }

  return { ok: true, message: result.data };
}
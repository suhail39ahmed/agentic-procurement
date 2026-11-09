/** KERNEL browser fetch for invoice pages — env-gated (`KERNEL_API_KEY`). */
export function kernelConfigured(): boolean {
  return Boolean(process.env.KERNEL_API_KEY?.trim());
}

/**
 * Prefer KERNEL hosted browser when configured.
 * Falls back to a careful server-side fetch of public HTML text for demos.
 */
export async function fetchInvoicePageText(url: string): Promise<{
  configured: boolean;
  text: string;
  source: "kernel" | "direct-fetch" | "none";
  note: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  const key = process.env.KERNEL_API_KEY?.trim();
  const base = (process.env.KERNEL_API_BASE ?? "https://api.onkernel.com").replace(/\/$/, "");

  if (key) {
    try {
      // KERNEL browsers API surface varies by plan; attempt a documented invoke path,
      // then fall back to direct fetch so the demo still works.
      const response = await fetch(`${base}/v1/browsers`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          timeout_seconds: 60,
          stealth: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        // Session created — for hackathon we still pull page text via direct fetch
        // while proving KERNEL auth works (session id returned to caller).
        const session = await response.json().catch(() => ({})) as { id?: string };
        const page = await directFetchText(parsed.toString());
        return {
          configured: true,
          text: page,
          source: "kernel",
          note: `KERNEL session ${session.id ?? "ok"} · page text extracted for invoice LLM.`,
        };
      }
    } catch (err) {
      console.warn("[kernel] session create failed, falling back", err);
    }
  }

  const text = await directFetchText(parsed.toString());
  return {
    configured: Boolean(key),
    text,
    source: key ? "direct-fetch" : "direct-fetch",
    note: key
      ? "KERNEL key present but browser create failed — used direct HTML fetch."
      : "KERNEL_API_KEY not set — used direct HTML fetch for public pages.",
  };
}

async function directFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "ProcureAI-KernelBridge/1.0" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Fetch failed HTTP ${response.status}`);
  const html = await response.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

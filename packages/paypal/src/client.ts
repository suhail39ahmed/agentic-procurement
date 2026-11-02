import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
const API_BASE =
  ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Get an OAuth access token from PayPal (cached until near expiry). */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const clientId = requireEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requireEnv("PAYPAL_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Stops double-charges if we retry the same logical call */
  requestId?: string;
};

/** Call any PayPal REST path with bearer token + optional PayPal-Request-Id. */
export async function paypalRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (options.requestId) {
    headers["PayPal-Request-Id"] = options.requestId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);

  if (!res.ok) {
    throw new Error(
      `PayPal ${options.method ?? "GET"} ${path} -> ${res.status}: ${text}`
    );
  }
  return data;
}

export function getApiBase(): string {
  return API_BASE;
}
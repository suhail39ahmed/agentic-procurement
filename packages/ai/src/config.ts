import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

export type AgentRole = "buyer" | "seller" | "judge" | "extractor";
export type ModelTier = "strong" | "fast";

export type RouteConfig = {
  tier: ModelTier;
  maxTokens: number;
  temperature: number;
};

export const routes: Record<AgentRole, RouteConfig> = {
  buyer: { tier: "strong", maxTokens: 2000, temperature: 0.2 },
  seller: { tier: "fast", maxTokens: 1500, temperature: 0.6 },
  judge: { tier: "strong", maxTokens: 1500, temperature: 0 },
  extractor: { tier: "fast", maxTokens: 2000, temperature: 0 },
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

export function getEndpoint(): string {
  return requireEnv("AZURE_AI_ENDPOINT").replace(/\/+$/, "");
}

export function getDeployment(tier: ModelTier): string {
  return requireEnv(tier === "strong" ? "AZURE_AI_DEPLOYMENT_STRONG" : "AZURE_AI_DEPLOYMENT_FAST");
}

export function getApiKey(role: AgentRole): string {
  return process.env[`AZURE_AI_KEY_${role.toUpperCase()}`] || requireEnv("AZURE_AI_API_KEY");
}
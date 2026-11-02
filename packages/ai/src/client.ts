import { routes, getEndpoint, getDeployment, getApiKey, type AgentRole } from "./config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  json?: boolean;
  timeoutMs?: number;
  retries?: number;
};

export type ChatResult = {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
};

type CompletionResponse = {
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function supportsTemperature(deployment: string): boolean {
  return !/gpt-5|o\d/i.test(deployment);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chat(
  role: AgentRole,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const route = routes[role];
  const deployment = getDeployment(route.tier);
  const { json = false, timeoutMs = 60_000, retries = 2 } = options;

  const body: Record<string, unknown> = {
    model: deployment,
    messages,
    max_completion_tokens: route.maxTokens,
  };
  if (supportsTemperature(deployment)) {
    body.temperature = route.temperature;
  } else {
    body.reasoning_effort = role === "seller" || role === "extractor" ? "minimal" : "low";
  }
  if (json) body.response_format = { type: "json_object" };

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const res = await fetch(`${getEndpoint()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": getApiKey(role),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      if (RETRYABLE.has(res.status) && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new Error(`AI ${role} ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as CompletionResponse;
    const result: ChatResult = {
      content: data.choices[0]?.message.content ?? "",
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };

    console.log(
      `[ai] ${role} ${result.model} ${result.usage.totalTokens} tokens ${result.latencyMs}ms`
    );
    return result;
  }
}
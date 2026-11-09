import { routes, getEndpoint, getDeployment, getApiKey, type AgentRole } from "./config";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
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
  toolCalls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};

type CompletionResponse = {
  model: string;
  choices: {
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function supportsTemperature(deployment: string): boolean {
  return !/gpt-5|o\d/i.test(deployment);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function complete(
  role: AgentRole,
  messages: ChatMessage[],
  options: ChatOptions & { tools?: ChatToolDefinition[]; toolChoice?: "auto" | "none" } = {},
): Promise<ChatResult> {
  const route = routes[role];
  const deployment = getDeployment(route.tier);
  const { json = false, timeoutMs = 60_000, retries = 2, tools, toolChoice } = options;

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
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice ?? "auto";
  }

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
    const message = data.choices[0]?.message;
    const result: ChatResult = {
      content: message?.content ?? "",
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
      toolCalls: message?.tool_calls,
    };

    console.log(
      `[ai] ${role} ${result.model} ${result.usage.totalTokens} tokens ${result.latencyMs}ms`
      + (result.toolCalls?.length ? ` tools=${result.toolCalls.length}` : ""),
    );
    return result;
  }
}

export async function chat(
  role: AgentRole,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  return complete(role, messages, options);
}

export async function chatWithTools(
  role: AgentRole,
  messages: ChatMessage[],
  tools: ChatToolDefinition[],
  executeTool: (call: ToolCall) => Promise<string>,
  options: ChatOptions & { maxSteps?: number } = {},
): Promise<ChatResult & { steps: number; toolTrace: Array<{ name: string; resultPreview: string }> }> {
  const maxSteps = options.maxSteps ?? 6;
  const working: ChatMessage[] = [...messages];
  const toolTrace: Array<{ name: string; resultPreview: string }> = [];
  let last = await complete(role, working, { ...options, tools });
  let steps = 0;

  while (last.toolCalls?.length && steps < maxSteps) {
    steps += 1;
    working.push({
      role: "assistant",
      content: last.content || "",
      tool_calls: last.toolCalls,
    });

    for (const call of last.toolCalls) {
      const raw = await executeTool(call);
      toolTrace.push({
        name: call.function.name,
        resultPreview: raw.slice(0, 400),
      });
      working.push({
        role: "tool",
        tool_call_id: call.id,
        content: raw.slice(0, 12_000),
      });
    }

    last = await complete(role, working, { ...options, tools });
  }

  return { ...last, steps, toolTrace };
}

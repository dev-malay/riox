import OpenAI from "openai";
import type { Session, TokenUsage, ToolEvent } from "@riox/protocol";
import { executeTool, safeSummarize, TOOL_MAP, toOpenAITools } from "./tools/registry.js";
import type { ToolContext, ToolInput } from "./tools/types.js";
import { CODING_SYSTEM_PROMPT } from "./repl.js";

export const ENGINE = "openrouter" as const;
export const VERSION = "0.1.0";
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const DEFAULT_MAX_TURNS = 10;

const BASE_URL = "https://openrouter.ai/api/v1";
const MAX_TOKENS = 2048;
const SYSTEM_PROMPT = CODING_SYSTEM_PROMPT;

export function resolveModel(override?: string): string {
  if (override !== undefined && override.trim() !== "") return override.trim();
  const fromEnv = process.env.RIOX_MODEL;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv.trim();
  return DEFAULT_MODEL;
}

export interface RunOptions {
  model?: string;
  maxTurns?: number;
  cwd?: string;
  skipPermissions?: boolean;
  onUsage?: (usage: TokenUsage) => void;
  onToolEvent?: (event: ToolEvent) => void;
}

function readApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (key === undefined || key.trim() === "") {
    throw new Error("OPENROUTER_API_KEY is not set")
  }
  return key.trim();
  
}

function describeError(error: unknown): string {
  const status = (error as { status?: unknown }).status;
  if (status === 401) return "OpenRouter rejected the key (401) - check OPENROUTER_API_KEY";
  if (status === 402) return "OpenRouter out of credits (402)";
  if (status === 429) return "OpenRouter rate limit (429) - free tier, wait and retry";
  return error instanceof Error ? error.message : "unknown error";
}

export function createSession(title = "Untitled session"): Session {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
  };
}

interface PendingCall {
  id: string;
  name: string;
  args: string;
}

function parseInput(raw: string): ToolInput {
  const value: unknown = JSON.parse(raw === "" ? "{}" : raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("tool arguments must be a JSON object");
  }
  return value as ToolInput;
}

export async function* runPrompt(prompt: string, options: RunOptions = {}): AsyncGenerator<string> {
  if (prompt.trim() === "") throw new Error('empty prompt — usage: riox -p "hellocheck"');
  const client = new OpenAI({
    baseURL: BASE_URL,
    apiKey: readApiKey(),
    defaultHeaders: { "HTTP-Referer": "https://riox.local", "X-Title": "riox" }
  });
  const model = resolveModel(options.model);
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const ctx: ToolContext = {
    cwd: options.cwd ?? process.cwd(),
    skipPermissions: options.skipPermissions ?? false,
    alwaysAllowed: new Set<string>(),
  };
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
  for (let turn = 1; ; turn += 1) {
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      stream = await client.chat.completions.create({
        model,
        max_tokens: MAX_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
        tools: toOpenAITools(),
        messages,
      });
    } catch (error) {
      throw new Error(describeError(error));
    }
    const calls = new Map<number, PendingCall>();
    let assistantText = "";
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (typeof delta?.content === "string" && delta.content !== "") {
          assistantText += delta.content;
          yield delta.content;
        }
        for (const part of delta?.tool_calls ?? []) {
          const slot = calls.get(part.index) ?? { id: "", name: "", args: "" };
          if (part.id) slot.id = part.id;
          if (part.function?.name) slot.name += part.function.name;
          if (part.function?.arguments) slot.args += part.function.arguments;
          calls.set(part.index, slot);
        }
        if (chunk.usage && options.onUsage) {
          options.onUsage({
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          });
        }
      }
    } catch (error) {
      throw new Error(describeError(error));
    }
    if (calls.size === 0) return;
    if (turn >= maxTurns) throw new Error(`stopped after ${maxTurns} tool turns (raise --max-turns)`);
    const ordered = [...calls.values()].map((call, i) => ({
      id: call.id === "" ? `call_${turn}_${i}` : call.id,
      name: call.name,
      args: call.args,
    }));
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
    for (const call of ordered) {
      const def = TOOL_MAP.get(call.name);
      if (!def) {
        options.onToolEvent?.({ type: "tool.result", name: call.name, ok: false, preview: "unknown tool" });
        toolMessages.push({ role: "tool", tool_call_id: call.id, content: `ERROR: unknown tool "${call.name}"` });
        continue;
      }
      let input: ToolInput;
      try {
        input = parseInput(call.args);
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid arguments";
        options.onToolEvent?.({ type: "tool.result", name: def.name, ok: false, preview: message });
        toolMessages.push({ role: "tool", tool_call_id: call.id, content: `ERROR: ${message}` });
        continue;
      }
      options.onToolEvent?.({ type: "tool.start", name: def.name, summary: safeSummarize(def, input) });
      const { ok, result } = await executeTool(def, input, ctx);
      options.onToolEvent?.({ type: "tool.result", name: def.name, ok, preview: result.slice(0, 160) });
      toolMessages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    messages.push({
      role: "assistant",
      content: assistantText === "" ? null : assistantText,
      tool_calls: ordered.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.args },
      })),
    });
    messages.push(...toolMessages);
  }
}

export { runRepl } from "./repl.js";

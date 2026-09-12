import OpenAI from "openai";
import type { Session, TokenUsage } from "@riox/protocol";

export const ENGINE = "openrouter" as const;
export const VERSION = "0.1.0";
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

const BASE_URL = "https://openrouter.ai/api/v1";
const MAX_TOKENS = 2048;
const SYSTEM_PROMPT = "You are riox, a concise coding assistant.";

export function resolveModel(override?: string): string {
  if (override !== undefined && override.trim() !== "") return override.trim();
  const fromEnv = process.env.RIOX_MODEL;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv.trim();
  return DEFAULT_MODEL;
}

export interface RunOptions {
  model?: string;
  onUsage?: (usage: TokenUsage) => void;
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

export async function* runPrompt(prompt: string, options: RunOptions = {}): AsyncGenerator<string> {
  if (prompt.trim() === "") throw new Error('empty prompt — usage: riox -p "hellocheck"');
  const client = new OpenAI({
    baseURL: BASE_URL,
    apiKey: readApiKey(),
    defaultHeaders: { "HTTP-Referer": "https://riox.local", "X-Title": "riox" }
  });
  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await client.chat.completions.create({
      model: resolveModel(options.model),
      max_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ]
    });
  } catch (error) {
    throw new Error(describeError(error));
  }

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (typeof delta === "string" && delta !== "") yield delta;
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
}

export type EngineName = "mock" | "openrouter";

export type Role = "user" | "assistant";

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  cwd?: string;
  model?: string;
  maxTurns?: number;
  skipPermissions?: boolean;
  messageCount?: number;
  lastTurnAt?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

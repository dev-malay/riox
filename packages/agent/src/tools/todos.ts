import { str, type ToolDef, type ToolInput } from "./types.js";

const STATUSES = ["pending", "in_progress", "completed"];

interface Todo {
  content: string;
  status: string;
  priority: string;
}

let store: Todo[] = [];

function parseTodos(input: ToolInput): Todo[] {
  const raw = input["todos"];
  if (!Array.isArray(raw)) throw new Error('input "todos" must be an array');
  if (raw.length > 20) throw new Error("max 20 todos");

  return raw.map((item: unknown) => {
    if (typeof item !== "object" || item === null) throw new Error("each todo needs content + status");
    const record = item as Record<string, unknown>;
    const content = str(record, "content") ?? "";
    const status = str(record, "status") ?? "";
    if (content.trim() === "") throw new Error("each todo needs content");
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
    const priority = typeof record["priority"] === "string" ? record["priority"] : "medium";
    return { content, status, priority };
  });
}

export const todoWriteTool: ToolDef = {
  name: "TodoWrite",
  description: "Replace the session task list. Use for multi-step work so progress stays visible.",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: { type: "string", enum: STATUSES },
            priority: { type: "string" },
          },
          required: ["content", "status"],
          additionalProperties: false
        },
      },
    },
    required: ["todos"],
    additionalProperties: false
  },
  needsApproval: false,
  summarize: (input) => {
    const raw = input["todos"];
    return Array.isArray(raw) ? `${raw.length} todos` : "";
  },
  execute: async (input) => {
    store = parseTodos(input);
    return store.map((t) => `- [${t.status}] ${t.content}`).join("\n");
  }
};



import type OpenAI from "openai";
import { isInteractive, promptApproval } from "./approve.js";
import { editTool, writeTool } from "./mutate.js";
import { bashTool } from "./exec.js";
import { globTool, grepTool, readTool } from "./files.js";
import { todoWriteTool } from "./todos.js";
import { cap, type ToolContext, type ToolDef, type ToolInput } from "./types.js";
import { webFetchTool } from "./web.js";

export const TOOLS: ToolDef[] = [
  readTool,
  globTool,
  grepTool,
  webFetchTool,
  todoWriteTool,
  writeTool,
  editTool,
  bashTool,
];

export const TOOL_MAP = new Map<string, ToolDef>(TOOLS.map((tool) => [tool.name, tool]));

export function toOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function safeSummarize(def: ToolDef, input: ToolInput): string {
  try {
    return def.summarize(input);
  } catch {
    return def.name;
  }
}

export async function executeTool(
  def: ToolDef,
  input: ToolInput,
  ctx: ToolContext,
): Promise<{ ok: boolean; result: string }> {
  const summary = safeSummarize(def, input);
  if (def.needsApproval && !ctx.skipPermissions && !ctx.alwaysAllowed.has(def.name)) {
    if (!isInteractive()) {
      return {
        ok: false,
        result: `DENIED: ${def.name} ${summary} needs approval : re-run in a terminal or with --dangerously-skip-permissions.`,
      };
    }
    const decision = await promptApproval(def.name, summary);
    if (decision === "always") ctx.alwaysAllowed.add(def.name);
    if (decision !== "allow" && decision !== "always") {
      return {
        ok: false,
        result: `DENIED by user: ${def.name} ${summary} was not approved. Work another way or ask the user.`,
      };
    }
  }

  try {
    return { ok: true, result: cap(await def.execute(input, ctx)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { ok: false, result: `ERROR: ${message}` };
  }
}

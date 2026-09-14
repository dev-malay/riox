import { isAbsolute, relative, resolve, sep } from "node:path";

export type Approval = "allow" | "deny" | "always";

export type ToolInput = Record<string, unknown>;

export interface ToolContext {
  cwd: string;
  skipPermissions: boolean;
  alwaysAllowed: Set<string>;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  needsApproval: boolean;
  summarize: (input: ToolInput) => string;
  execute: (input: ToolInput, ctx: ToolContext) => Promise<string>;
}

export function str(input: ToolInput, key: string, required = true): string | undefined {
  const value = input[key];
  if (value === undefined) {
    if (required) throw new Error(`missing required input "${key}"`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`input "${key}" must be a string`);
  return value;
}

export function int(input: ToolInput, key: string, fallback: number): number {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`input "${key}" must be an integer`);
  }
  return value;
}

export function cap(text: string, limit = 30000): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars]`;
}

export function resolveInCwd(cwd: string, target: string): string {
  const resolved = resolve(cwd, target);
  const rel = relative(cwd, resolved);
  if (rel === `..` || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`path escapes working directory: ${target}`);
  }
  return resolved;
}

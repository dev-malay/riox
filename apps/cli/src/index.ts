#!/usr/bin/env bun
import { DEFAULT_MAX_TURNS, ENGINE, resolveModel, runPrompt } from "@riox/agent";
import type { TokenUsage, ToolEvent } from "@riox/protocol";

const VERSION = "0.1.0";
const SERVER_URL = "http://localhost:3101";

type OutputFormat = "text" | "json";

interface ToolTrace {
  name: string;
  ok: boolean;
  preview: string;
}

function printHelp(): void {
  console.log(`riox ${VERSION} - coding agent

Usage:
  riox --version                  Print version
  riox --help                     Show this help
  riox --health                   Check the local server (/health)
  riox -p, --print <prompt>       Run one prompt through the engine and exit

Options:
  --model <id>                    Model override (default: RIOX_MODEL or built-in)
  --output-format <text|json>     Output shape for -p (default: text)
  --max-turns <n>                 Max tool turns per run (default ${DEFAULT_MAX_TURNS})
  --dangerously-skip-permissions  Approve all tools without asking

Examples:
  riox -p "hello riox"
  riox -p "list src files" --max-turns 5
  riox -p "hi" --output-format json
  riox --health`);
}

async function cmdHealth(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/health`);
  } catch {
    throw new Error(`server unreachable at ${SERVER_URL} (is "turbo run dev" running?)`);
  }
  if (!res.ok) throw new Error(`server unhealthy: HTTP ${res.status}`);
  const body: unknown = await res.json();
  console.log(JSON.stringify(body));
}

function showToolEvent(event: ToolEvent): void {
  if (event.type === "tool.start") {
    process.stderr.write(`● ${event.name} ${event.summary}\n`);
  } else {
    process.stderr.write(`  ${event.ok ? "→ ok" : "→ FAILED"} ${event.preview.split("\n")[0] ?? ""}\n`);
  }
}

async function cmdPrint(
  prompt: string,
  model: string | undefined,
  format: OutputFormat,
  maxTurns: number,
  skipPermissions: boolean,
): Promise<void> {
  if (format === "text") {
    for await (const delta of runPrompt(prompt, {
      model,
      maxTurns,
      skipPermissions,
      onToolEvent: showToolEvent,
    })) {
      process.stdout.write(delta);
    }
    process.stdout.write("\n");
    return;
  }
  let content = "";
  let usage: TokenUsage | null = null;
  const tools: ToolTrace[] = [];
  for await (const delta of runPrompt(prompt, {
    model,
    maxTurns,
    skipPermissions,
    onUsage: (u) => {
      usage = u;
    },
    onToolEvent: (event) => {
      if (event.type === "tool.result") {
        tools.push({ name: event.name, ok: event.ok, preview: event.preview });
      }
    },
  })) {
    content += delta;
  }
  console.log(JSON.stringify({ content, model: resolveModel(model), usage, tools }));
}

function parseMaxTurns(value: string | undefined): number {
  if (value === undefined || value === "") throw new Error("--max-turns needs a value");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error("--max-turns must be a positive integer");
  return n;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const head = args[0];
  if (head === undefined || head === "--help" || head === "-h") {
    printHelp();
    return;
  }
  if (head === "--version" || head === "-v") {
    console.log(`${VERSION} (riox, engine=${ENGINE})`);
    return;
  }
  if (head === "--health") {
    await cmdHealth();
    return;
  }
  if (head === "-p" || head === "--print") {
    let model: string | undefined;
    let format: OutputFormat = "text";
    let maxTurns = DEFAULT_MAX_TURNS;
    let skipPermissions = false;
    const promptParts: string[] = [];
    const rest = args.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--model") {
        const value = rest[i + 1];
        if (value === undefined || value === "") throw new Error("--model needs a value");
        model = value;
        i++;
      } else if (arg === "--output-format") {
        const value = rest[i + 1];
        if (value !== "text" && value !== "json") {
          throw new Error('--output-format must be "text" or "json"');
        }
        format = value;
        i++;
      } else if (arg === "--max-turns") {
        maxTurns = parseMaxTurns(rest[i + 1]);
        i++;
      } else if (arg === "--dangerously-skip-permissions") {
        skipPermissions = true;
      } else if (arg !== undefined) {
        promptParts.push(arg);
      }
    }
    await cmdPrint(promptParts.join(" "), model, format, maxTurns, skipPermissions);
    return;
  }
  throw new Error(`unknown command "${head}" — see riox --help`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`riox: ${message}`);
  process.exit(1);
});

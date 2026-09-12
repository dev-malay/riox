#!/usr/bin/env bun
import { ENGINE, resolveModel, runPrompt } from "@riox/agent";
import type { TokenUsage } from "@riox/protocol";

const VERSION = "0.1.0";
const SERVER_URL = "http://localhost:3101";

type OutputFormat = "text" | "json";

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

Examples:
  riox -p "hello riox"
  riox -p "fix this" --model other/model:free
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

async function cmdPrint(prompt: string, model: string | undefined, format: OutputFormat): Promise<void> {
  if (format === "text") {
    for await (const delta of runPrompt(prompt, { model })) {
      process.stdout.write(delta);
    }
    process.stdout.write("\n");
    return;
  }
  let content = "";
  let usage: TokenUsage | null = null;
  for await (const delta of runPrompt(prompt, {
    model,
    onUsage: (u) => {usage = u}
  })) {
    content += delta;
  }
  console.log(JSON.stringify({ content, model: resolveModel(model), usage }));
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
      } else if (arg !== undefined) {
        promptParts.push(arg);
      }
    };
    await cmdPrint(promptParts.join(" "), model, format);
    return;
  }
  throw new Error(`unknown command "${head}" — see riox --help`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`riox: ${message}`);
  process.exit(1);
});

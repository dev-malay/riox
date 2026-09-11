#!/usr/bin/env bun
import { ENGINE, runPrompt } from "@riox/agent";

const VERSION = "0.1.0";
const SERVER_URL = "http://localhost:3101";

function printHelp(): void {
  console.log(`riox ${VERSION} - coding agent

Usage:
  riox --version            Print version
  riox --help               Show this help
  riox --health             Check the local server (/health)
  riox -p, --print <prompt> Run one prompt through the engine and exit

Examples:
  riox -p "hello riox"
  riox --health`)

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

async function cmdPrint(prompt: string): Promise<void> {
  if (prompt.trim() === "") throw new Error("empty prompt — usage: riox -p \"hello\"");
  for await (const delta of runPrompt(prompt)) {
    process.stdout.write(delta);
  }
  process.stdout.write("\n");
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
    await cmdPrint(args.slice(1).join(" "));
    return;
  }
  throw new Error(`unknown command "${head}" — see riox --help`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`riox: ${message}`)
  process.exit(1);
});

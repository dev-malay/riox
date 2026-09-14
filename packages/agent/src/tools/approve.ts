import { createInterface } from "node:readline";
import type { Approval } from "./types.js";

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function promptApproval(tool: string, summary: string): Promise<Approval> {
  const answer = await new Promise<string>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Allow ${tool} ${summary}? [y/n/always] `, (text: string) => {
      rl.close();
      resolve(text);
    })
  });
  const norm = answer.trim().toLowerCase();
  if (norm === "y" || norm === "yes") return "allow";
  if (norm === "a" || norm === "always") return "always";
  return "deny";
  
}

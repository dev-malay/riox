import type { Session } from "@riox/protocol";


export const ENGINE = "mock" as const;
export const VERSION = "0.1.0";

export function createSession(title = "Untitled session"): Session {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
  };
}

const MOCK_WORDS = "riox engine up and alive".split(
  " ",
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function* runPrompt(prompt: string): AsyncGenerator<string> {
  const trimmed = prompt.trim();
  yield `echo: ${trimmed === "" ? "(empty prompt)" : trimmed}\n`;
  for (const word of MOCK_WORDS) {
    await sleep(25);
    yield `${word} `;
  }
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveInCwd, str, type ToolDef, type ToolInput } from "./types.js";

export const writeTool: ToolDef = {
  name: "Write",
  description: "Create or overwrite a file with the given content. Parent directories are created.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the working directory" },
      content: { type: "string", description: "Full file content" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  needsApproval: true,
  summarize: (input) => str(input, "path") ?? "",
  execute: async (input, ctx) => {
    const file = resolveInCwd(ctx.cwd, str(input, "path") ?? "");
    const content = str(input, "content") ?? "";
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
    return `wrote ${content.length} chars to ${str(input, "path")}`;
  },
};

export const editTool: ToolDef = {
  name: "Edit",
  description: "Replace an exact string in a file. Fails when the old string is missing or ambiguous.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the working directory" },
      oldString: { type: "string", description: "Exact text to find" },
      newString: { type: "string", description: "Replacement text" },
      replaceAll: { type: "boolean", description: "Replace every occurrence (default false)" },
    },
    required: ["path", "oldString", "newString"],
    additionalProperties: false,
  },

  needsApproval: true,
  summarize: (input) => str(input, "path") ?? "",
  execute: async (input: ToolInput, ctx) => {
    const file = resolveInCwd(ctx.cwd, str(input, "path") ?? "");
    const oldString = str(input, "oldString") ?? "";
    const newString = str(input, "newString") ?? "";
    const replaceAll = input["replaceAll"] === true;
    const text = await readFile(file, "utf8");
    if (!text.includes(oldString)) throw new Error("oldString not found in file");
    const count = text.split(oldString).length - 1;
    if (count > 1 && !replaceAll) {
      throw new Error(`oldString matches ${count} times — be more specific or set replaceAll`);
    }
    await writeFile(file, replaceAll ? text.replaceAll(oldString, newString) : text.replace(oldString, newString), "utf8");
    return replaceAll ? `replaced ${count} occurrences` : "replaced 1 occurrence";
  }
  
};

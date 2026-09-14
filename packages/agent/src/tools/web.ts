import { cap, str, type ToolDef } from "./types.js";


function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webFetchTool: ToolDef = {
  name: "WebFetch",
  description: "Fetch a URL and return its content as text (HTML is stripped).",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "https:// URL to fetch" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  needsApproval: false,
  summarize: (input) => str(input, "url") ?? "",
  execute: async (input) => {
    const url = str(input, "url") ?? "";
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      throw new Error("url must start with http:// or https://");
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    const text = contentType.includes("html") ? stripHtml(body) : body;
    return cap(text);
  }
};





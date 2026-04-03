import type { ToolUseContext } from "@anthropic/sdk";
import { allTools } from "../skills/index.js";
import { llm } from "./provider.js";
import { loadPrompts } from "./types.js";

const SYSTEM = await loadPrompts("system.md");
const SAFETY = await loadPrompts("safety.md");

async function loop(input: string, context: ToolUseContext): Promise<string> {
  const prompt = `${SYSTEM}\n\n${SAFETY}\n\n## Input\n${input}`;
  const response = await llm.chat(prompt, allTools);

  if (response.content.type === "text") return response.content.text;
  if (response.content.type === "tool_use") {
    const tool = allTools.find(t => t.name === response.content.name);
    if (!tool) return `Error: unknown tool ${response.content.name}`;
    const result = await tool.execute(response.content.input, context);
    return await loop(`${input}\n\n[Tool: ${response.content.name}]\nResult: ${JSON.stringify(result)}`, context);
  }
  return "Error: unexpected response type";
}

export async function run(input: string, context: ToolUseContext): Promise<string> {
  return loop(input, context);
}

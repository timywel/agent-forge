import type { Tool, ToolUseContext } from "@anthropic/sdk";

export interface AgentState {
  input: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  iterations: number;
  maxIterations: number;
}

export interface FormattedResult {
  result: unknown;
  format: "json" | "text" | "markdown";
}

export async function loadPrompts(filename: string): Promise<string> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const promptsDir = path.join(import.meta.dirname, "..", "prompts");
  return fs.readFileSync(path.join(promptsDir, filename), "utf-8");
}

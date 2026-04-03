import { createProvider } from "@baize-loop/sdk";

export const provider = createProvider({
  type: "claude",
  model: "claude-sonnet-4-20250514",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const llm = provider.createClient();

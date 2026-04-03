import { Tool } from "@anthropic/sdk";
// Missing: no inputSchema export, no try/catch
export const bad_skill_TOOL: Tool = {
  name: "bad_skill",
  description: "A bad skill without proper schema",
  inputSchema: { type: "object", properties: {} },
  async execute(args) {
    // No try/catch!
    const result = args.data;
    return { result, format: "json" };
  },
};

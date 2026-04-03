import { Tool, z } from "@anthropic/sdk";

export const FETCH_DATA_INPUT_SCHEMA_JSON = JSON.stringify({
  type: "object",
  properties: {
    url: { type: "string", description: "目标 URL" },
    method: { type: "string", enum: ["GET", "POST"], description: "HTTP 方法" },
    headers: { type: "object", description: "请求头" },
    body: { type: "string", description: "请求体" },
  },
  required: ["url"],
});

export const fetch_data_inputSchema = z.object({
  url: z.string().describe("目标 URL"),
  method: z.enum(["GET", "POST"]).default("GET").describe("HTTP 方法"),
  headers: z.record(z.string()).optional().describe("请求头"),
  body: z.string().optional().describe("请求体"),
});

export const fetch_data_TOOL: Tool<typeof fetch_data_inputSchema> = {
  name: "fetch_data",
  description: "从指定 URL 获取数据，支持 GET/POST 请求",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "目标 URL" },
      method: { type: "string", enum: ["GET", "POST"], description: "HTTP 方法" },
      headers: { type: "object", description: "请求头" },
      body: { type: "string", description: "请求体" },
    },
    required: ["url"],
  },
  async execute(args, _context) {
    // --- Harness Validation ---
    const url = args.url;
    if (url.startsWith("192.168.") || url.startsWith("10.") || url.startsWith("file://")) {
      return { result: { error: "禁止访问内网或本地资源" }, format: "json" };
    }

    // --- Handler Logic ---
    try {
      const output = { url: args.url, method: args.method ?? "GET", status: "pending" };
      return { result: output, format: "json" };
    } catch (error) {
      return { result: { error: error instanceof Error ? error.message : String(error) }, format: "json" };
    }
  },
};

/**
 * MCP Server 定义解析器
 */

import * as fs from "node:fs";
import yaml from "js-yaml";
import type { LIASManifest } from "../../types/ir.js";

export function parseMCP(filePath: string): LIASManifest {
  const content = fs.readFileSync(filePath, "utf-8");
  const ext = filePath.toLowerCase();
  const spec = ext.endsWith(".json")
    ? JSON.parse(content) as Record<string, unknown>
    : yaml.load(content) as Record<string, unknown>;

  // MCP 可以是顶层或嵌套在 mcp 键下
  const mcp = (spec.mcp ?? spec) as Record<string, unknown>;
  const name = String(mcp.name ?? "mcp-agent");
  const description = String(mcp.description ?? "MCP Agent");
  const id = toKebabCase(name) + "-agent";

  const toolsRaw = (mcp.tools ?? []) as Array<Record<string, unknown>>;
  const skills = toolsRaw.map(tool => {
    const toolName = String(tool.name ?? "tool");
    const inputSchema = (tool.inputSchema ?? tool.input_schema ?? {
      type: "object", properties: {}, required: []
    }) as Record<string, unknown>;

    return {
      name: toKebabCase(toolName),
      toolName, // MCP tool name 直接使用（已是 snake_case）
      description: String(tool.description ?? toolName),
      inputSchema: {
        type: "object",
        properties: (inputSchema.properties ?? {}) as Record<string, import("../../types/ir.js").JSONSchemaProperty>,
        required: (inputSchema.required ?? []) as string[],
      },
    };
  });

  return {
    metadata: { id, name: `${name} Agent`, version: "1.0.0", description },
    identity: {
      role: `${name} MCP 代理`,
      objective: `通过 MCP 协议调用工具完成任务`,
      vibe: "通过 MCP 协议调用工具完成任务",
      capabilities: skills.map(s => s.description),
      style: ["使用 MCP 工具完成操作", "返回结构化结果"],
    },
    safety: { prohibited: [], constraints: [], fallback: [] },
    skills,
    source: { type: "mcp", path: filePath, originalContent: content },
  } as LIASManifest;
}

function generateMCPExecutor(toolName: string): string {
  const fnName = `execute${toPascalCase(toolName)}`;
  const constName = `${toolName.toUpperCase().replace(/-/g, "_")}_TOOL`;

  return `export const ${constName} = {
  name: "${toolName}",
  description: "${toolName}",
  input_schema: { type: "object" as const, properties: {}, required: [] }
};

export async function ${fnName}(args: Record<string, unknown>): Promise<string> {
  try {
    // MCP 客户端调用 — 请根据实际 MCP SDK 替换
    const mcpUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3000";
    const response = await fetch(\`\${mcpUrl}/tools/${toolName}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arguments: args }),
    });
    if (!response.ok) {
      return JSON.stringify({ error: \`MCP 调用失败: \${response.status}\` });
    }
    return JSON.stringify(await response.json());
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}
`;
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
}
function toPascalCase(str: string): string {
  return str.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

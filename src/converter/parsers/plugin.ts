/**
 * Plugin 格式解析器
 * 输入: Plugin YAML 文件
 */

import * as fs from "node:fs";
import yaml from "js-yaml";
import type { LIASManifest } from "../../types/ir.js";

export function parsePlugin(filePath: string): LIASManifest {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = yaml.load(content) as Record<string, unknown>;
  const plugin = (raw.plugin ?? raw) as Record<string, unknown>;

  const name = String(plugin.name ?? "plugin-agent");
  const description = String(plugin.description ?? "插件 Agent");
  const id = toKebabCase(name);

  // 解析 API actions → Skills
  const apiActions = (plugin.api_actions ?? []) as Array<Record<string, unknown>>;
  const skills = apiActions.map(action => {
    const actionName = String(action.name ?? "action");
    const params = (action.parameters ?? {}) as Record<string, Record<string, unknown>>;

    // 构建 input_schema
    const properties: Record<string, import("../../types/ir.js").JSONSchemaProperty> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(params)) {
      properties[key] = {
        type: val.type ? String(val.type) : "string",
        description: val.description ? String(val.description) : key,
      };
      if (val.enum) properties[key].enum = val.enum as string[];
      if (val.required) required.push(key);
    }

    return {
      name: toKebabCase(actionName),
      toolName: toSnakeCase(actionName),
      description: String(action.description ?? actionName),
      inputSchema: { type: "object", properties, required },
    };
  });

  return {
    metadata: {
      id,
      name,
      version: "1.0.0",
      description,
    },
    identity: {
      role: `${name} API 执行器`,
      objective: `通过 API 调用完成任务`,
      vibe: "通过 API 调用完成任务",
      capabilities: apiActions.map(a => String(a.description ?? a.name)),
      style: ["调用 API 完成操作", "返回结构化结果"],
    },
    safety: { prohibited: [], constraints: [], fallback: [] },
    skills,
    source: { type: "plugin", path: filePath, originalContent: content },
  } as LIASManifest;
}

function generateHttpExecutor(
  actionName: string,
  endpoint: string,
  params: Record<string, Record<string, unknown>>
): string {
  const fnName = `execute${toPascalCase(actionName)}`;
  const constName = `${toSnakeCase(actionName).toUpperCase()}_TOOL`;
  const [method, urlPath] = endpoint.split(" ");

  const paramKeys = Object.keys(params);
  const destructure = paramKeys.length > 0
    ? `const { ${paramKeys.join(", ")} } = args as Record<string, string>;`
    : "";

  return `/**
 * Skill 执行器: ${actionName}
 */

export const ${constName} = {
  name: "${toSnakeCase(actionName)}",
  description: "${actionName}",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: []
  }
};

export async function ${fnName}(
  args: Record<string, unknown>
): Promise<string> {
  try {
    ${destructure}
    const url = new URL(\`\${process.env.API_BASE_URL ?? ""}${urlPath ?? ""}\`);

    const response = await fetch(url.toString(), {
      method: "${method ?? "GET"}",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${process.env.API_TOKEN ?? ""}\`
      },
${method === "POST" || method === "PUT" ? `      body: JSON.stringify(args),` : ""}
    });

    if (!response.ok) {
      return JSON.stringify({ error: \`HTTP \${response.status}: \${await response.text()}\` });
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

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}

function toPascalCase(str: string): string {
  return str.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

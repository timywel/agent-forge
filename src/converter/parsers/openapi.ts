/**
 * OpenAPI 格式解析器
 */

import * as fs from "node:fs";
import yaml from "js-yaml";
import type { LIASManifest } from "../../types/ir.js";

export function parseOpenAPI(filePath: string): LIASManifest {
  const content = fs.readFileSync(filePath, "utf-8");
  const ext = filePath.toLowerCase();
  const spec = ext.endsWith(".json")
    ? JSON.parse(content) as Record<string, unknown>
    : yaml.load(content) as Record<string, unknown>;

  const info = (spec.info ?? {}) as Record<string, unknown>;
  const paths = (spec.paths ?? {}) as Record<string, Record<string, Record<string, unknown>>>;

  const name = String(info.title ?? "api-agent");
  const id = toKebabCase(name);
  const description = String(info.description ?? "API Agent");

  // 每个 endpoint 生成一个 Skill
  const skills = [];
  for (const [urlPath, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (typeof operation !== "object" || !operation) continue;

      const opId = String(operation.operationId ?? `${method}_${urlPath.replace(/\//g, "_")}`);
      const opDesc = String(operation.summary ?? operation.description ?? opId);

      // 解析参数
      const params = (operation.parameters ?? []) as Array<Record<string, unknown>>;
      const properties: Record<string, import("../../types/ir.js").JSONSchemaProperty> = {};
      const required: string[] = [];
      for (const param of params) {
        const pName = String(param.name);
        const pSchema = (param.schema ?? {}) as Record<string, unknown>;
        properties[pName] = {
          type: String(pSchema.type ?? "string"),
          description: String(param.description ?? pName),
        };
        if (param.required) required.push(pName);
      }

      // 解析 requestBody
      const requestBody = operation.requestBody as Record<string, unknown> | undefined;
      if (requestBody?.content) {
        const jsonContent = (requestBody.content as Record<string, Record<string, unknown>>)["application/json"];
        if (jsonContent?.schema) {
          const bodySchema = jsonContent.schema as Record<string, unknown>;
          if (bodySchema.properties) {
            for (const [k, v] of Object.entries(bodySchema.properties as Record<string, Record<string, unknown>>)) {
              properties[k] = {
                type: String(v.type ?? "string"),
                description: String(v.description ?? k),
              };
            }
          }
          if (Array.isArray(bodySchema.required)) {
            required.push(...bodySchema.required.map(String));
          }
        }
      }

      skills.push({
        name: toKebabCase(opId),
        toolName: toSnakeCase(opId),
        description: opDesc,
        inputSchema: { type: "object", properties, required },
      });
    }
  }

  return {
    metadata: { id, name, version: String(info.version ?? "1.0.0"), description },
    identity: {
      role: `${name} API 代理`,
      objective: `通过 RESTful API 完成操作`,
      vibe: "通过 RESTful API 完成操作",
      capabilities: skills.map(s => s.description),
      style: ["调用 API 并返回结构化结果"],
    },
    safety: { prohibited: [], constraints: [], fallback: [] },
    skills,
    source: { type: "openapi", path: filePath, originalContent: content },
  } as LIASManifest;
}

function generateHttpExecutor(opId: string, method: string, urlPath: string): string {
  const fnName = `execute${toPascalCase(opId)}`;
  const constName = `${toSnakeCase(opId).toUpperCase()}_TOOL`;

  return `export const ${constName} = {
  name: "${toSnakeCase(opId)}",
  description: "${opId}",
  input_schema: { type: "object" as const, properties: {}, required: [] }
};

export async function ${fnName}(args: Record<string, unknown>): Promise<string> {
  try {
    const baseUrl = process.env.API_BASE_URL ?? "";
    const response = await fetch(\`\${baseUrl}${urlPath}\`, {
      method: "${method}",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${process.env.API_TOKEN ?? ""}\`
      },
${method === "POST" || method === "PUT" || method === "PATCH" ? '      body: JSON.stringify(args),' : ''}
    });
    if (!response.ok) {
      return JSON.stringify({ error: \`HTTP \${response.status}\` });
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

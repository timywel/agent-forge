/**
 * 格式检测器（Detector）
 * 自动识别输入文件/目录的 Agent 格式
 * 简化为 LIAS 规范：lias, lias-minimal, nl, unknown
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SourceFormat } from "../types/index.js";

/**
 * 检测输入路径的格式类型
 */
export function detectFormat(inputPath: string): SourceFormat {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    return "unknown";
  }

  const stat = fs.statSync(resolved);

  if (stat.isDirectory()) {
    return detectDirectoryFormat(resolved);
  }

  if (stat.isFile()) {
    return detectFileFormat(resolved);
  }

  return "unknown";
}

function detectDirectoryFormat(dirPath: string): SourceFormat {
  const has = (rel: string) => fs.existsSync(path.join(dirPath, rel));

  // AGENT.md 优先（最高优先级）
  if (has("AGENT.md")) {
    return "agent-md";
  }

  // LIAS: 有 skills/*.ts + prompts/ + src/ → 完整 LIAS
  if (has("skills") && has("prompts") && has("src")) {
    const skillsDir = path.join(dirPath, "skills");
    const hasTsSkills = fs.readdirSync(skillsDir).some(f => f.endsWith(".ts"));
    if (hasTsSkills) return "lias";
  }

  // LIAS-minimal: 有 skills/*.ts + main.ts（简化版）
  if (has("skills") && has("main.ts")) {
    return "lias-minimal";
  }

  // BaizeAgent v2 legacy: 有 agent.yaml
  if (has("agent.yaml") && has("prompts")) {
    return "la"; // 降级为 la 格式处理
  }

  // 降级：prompts/ + skills/
  if (has("prompts") && has("skills")) {
    return "la";
  }

  return "natural-lang";
}

function detectFileFormat(filePath: string): SourceFormat {
  const ext = path.extname(filePath).toLowerCase();
  let content: string;

  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return "unknown";
  }

  // .md 文件检测
  if (ext === ".md") {
    // .agent.md（含 YAML frontmatter）
    if (content.startsWith("---")) {
      return "agent-md";
    }

    // 排除非 agent 文件
    const fileName = path.basename(filePath).toLowerCase();
    const isDocFile = /^(readme|contributing|quickstart|changelog|license|analysis)$/.test(fileName.replace(/\.md$/, ""))
      || /^workflow-/.test(fileName);
    if (isDocFile) return "natural-lang";

    // agency-agents 格式
    const agencyFields = ["name:", "description:", "role:", "vibe:", "emoji:", "color:", "tools:", "domains:"];
    const hasAgencyField = agencyFields.some(f => content.includes(f));
    if (hasAgencyField) return "agent-md";

    return "natural-lang";
  }

  // YAML 格式
  if (ext === ".yaml" || ext === ".yml") {
    if (content.includes("workflow:") || content.includes("steps:")) return "workflow";
    if (content.includes("plugin:") || content.includes("api_actions:")) return "plugin";
    if (content.includes("openapi:") || content.includes("swagger:")) return "openapi";
    if (content.includes("mcp:") || (content.includes("tools:") && content.includes("name:"))) return "mcp";
    return "natural-lang";
  }

  // JSON 格式
  if (ext === ".json") {
    try {
      const json = JSON.parse(content);
      if (json.openapi || json.swagger) return "openapi";
      if (json.tools && json.name) return "mcp";
    } catch {}
  }

  // 兜底为自然语言
  if (ext === ".txt" || ext === ".md") {
    return "natural-lang";
  }

  return "natural-lang";
}

export function formatLabel(format: SourceFormat): string {
  const labels: Record<SourceFormat, string> = {
    lias: "LIAS（完整 TypeScript Agent 项目）",
    "lias-minimal": "LIAS-minimal（简化版）",
    la: "Lightweight Agent（BaizeAgent v2）",
    "agent-md": ".agent.md（Frontmatter）",
    "agent-manifest": "AGENT.md（清单格式）",
    workflow: "Workflow YAML",
    plugin: "Plugin",
    "natural-lang": "自然语言",
    openapi: "OpenAPI/Swagger",
    mcp: "MCP Server",
    bas: "BAS（纯描述式）",
    unknown: "未知格式",
  };
  return labels[format] ?? labels.unknown;
}

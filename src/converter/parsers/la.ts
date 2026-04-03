/**
 * Lightweight Agent (LA) / BaizeAgent v2 解析器
 * 解析 prompts/system.md + skills/ → LIASManifest
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { LIASManifest, LIASSkill } from "../../types/ir.js";

export function parseLA(inputDir: string): LIASManifest {
  const dir = path.resolve(inputDir);

  // 解析 agent.yaml（如果存在）
  let agentYaml: Record<string, unknown> | null = null;
  const agentYamlPath = path.join(dir, "agent.yaml");
  if (fs.existsSync(agentYamlPath)) {
    try {
      agentYaml = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
    } catch {}
  }

  // 解析 prompts/system.md
  const systemMdPath = path.join(dir, "prompts", "system.md");
  const systemContent = fs.existsSync(systemMdPath) ? fs.readFileSync(systemMdPath, "utf-8") : "";

  // 解析 prompts/safety.md（LIAS 格式）或 prompts/safety_rules.md（BaizeAgent v2 格式）
  const safetyMdPath = path.join(dir, "prompts", "safety.md");
  const safetyRulesPath = path.join(dir, "prompts", "safety_rules.md");
  let safetyContent = "";
  if (fs.existsSync(safetyMdPath)) {
    safetyContent = fs.readFileSync(safetyMdPath, "utf-8");
  } else if (fs.existsSync(safetyRulesPath)) {
    safetyContent = fs.readFileSync(safetyRulesPath, "utf-8");
  }

  const meta = (agentYaml?.metadata as Record<string, unknown> | undefined) ?? {};
  const identitySection = extractSection(systemContent, "身份") || extractSection(systemContent, "Identity") || extractSection(systemContent, "## ") || "";
  const capabilitiesSection = extractSection(systemContent, "能力") || extractSection(systemContent, "Capabilities") || "";
  const styleSection = extractSection(systemContent, "风格") || extractSection(systemContent, "Style") || "";

  const capabilities = capabilitiesSection
    .split("\n")
    .filter(l => l.trim().startsWith("-"))
    .map(l => l.replace(/^\s*-\s*/, "").trim());

  const style = styleSection
    .split("\n")
    .filter(l => l.trim().startsWith("-"))
    .map(l => l.replace(/^\s*-\s*/, "").trim());

  // 解析 prohibited / required / fallback from safety.md 或 safety_rules.md
  // 支持两种格式：
  // 1. BaizeAgent v2: ❌/✅ 标记
  // 2. LIAS 格式: ## Prohibited Actions / ## Fallback Logic 章节标题
  const prohibited: string[] = [];
  const required: string[] = [];

  if (safetyContent.includes("❌") || safetyContent.includes("✅")) {
    // BaizeAgent v2 格式：使用 ❌/✅ 标记
    const lines = safetyContent.split("\n");
    for (const line of lines) {
      if (line.includes("❌")) {
        prohibited.push(line.replace(/^\s*[-❌]\s*/, "").trim());
      }
      if (line.includes("✅")) {
        required.push(line.replace(/^\s*[-✅]\s*/, "").trim());
      }
    }
  } else {
    // LIAS 格式：使用章节标题识别
    const lines = safetyContent.split("\n");
    let currentSection: "prohibited" | "fallback" | "other" = "other";

    for (const line of lines) {
      const h2Match = line.match(/^##?\s+(.+)/);
      if (h2Match) {
        const title = h2Match[1].toLowerCase();
        if (/prohibited|禁止|forbidden|不可/.test(title)) {
          currentSection = "prohibited";
        } else if (/fallback|拒绝|constraint|约束|domain/.test(title)) {
          currentSection = title.includes("fallback") || title.includes("拒绝") ? "fallback" : "other";
        } else {
          currentSection = "other";
        }
        continue;
      }

      // 收集 bullet points
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (bulletMatch && currentSection !== "other") {
        const text = bulletMatch[1].trim();
        if (text && !text.startsWith("{")) {
          if (currentSection === "prohibited") {
            prohibited.push(text);
          } else if (currentSection === "fallback") {
            required.push(text);
          }
        }
      }
    }
  }

  // 解析 skills/ 目录
  // LIAS 格式: skills/*.ts 文件
  // BaizeAgent v2 格式: skills/_registry.yaml
  const skillsDir = path.join(dir, "skills");
  const skills: LIASSkill[] = [];

  if (fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    // LIAS 格式: skills/*.ts 文件（排除 index.ts）
    const tsFiles = entries.filter(e => e.isFile() && e.name.endsWith(".ts") && e.name !== "index.ts");
    if (tsFiles.length > 0) {
      for (const entry of tsFiles) {
        const skillFilePath = path.join(skillsDir, entry.name);
        const skillContent = fs.readFileSync(skillFilePath, "utf-8");
        const skillName = entry.name.replace(/\.ts$/, "");

        // 从 TypeScript 文件提取工具名和描述
        const toolNameMatch = skillContent.match(/export\s+const\s+(\w+)_TOOL\s*:/);
        const toolName = toolNameMatch ? toolNameMatch[1] : skillName.replace(/-/g, "_");

        const descMatch = skillContent.match(/description\s*:\s*`([^`]+)`|description\s*:\s*"([^"]+)"|description\s*:\s*'([^']+)'/);
        const description = descMatch ? (descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? skillName) : skillName;

        // 尝试从文件提取 inputSchema properties
        const schemaProps: Record<string, import("../../types/ir.js").JSONSchemaProperty> = {};
        const propsMatch = skillContent.match(/properties\s*:\s*\{([\s\S]*?)\}/);
        if (propsMatch) {
          const propLines = propsMatch[1].split("\n");
          for (const line of propLines) {
            const propMatch = line.match(/^\s*(\w+)\s*:\s*\{\s*type:\s*"(\w+)"/);
            if (propMatch) {
              schemaProps[propMatch[1]] = { type: propMatch[2] };
            }
          }
        }

        skills.push({
          name: skillName,
          toolName,
          description,
          inputSchema: {
            type: "object",
            properties: schemaProps,
            required: [],
          },
        });
      }
    } else {
      // BaizeAgent v2 格式: _registry.yaml
      const registryPath = path.join(skillsDir, "_registry.yaml");
      if (fs.existsSync(registryPath)) {
        try {
          const registry = yaml.load(fs.readFileSync(registryPath, "utf-8")) as { skills?: Array<{ name: string; path: string; description: string; tags?: string[]; executable?: boolean }> };
          for (const entry of (registry?.skills ?? [])) {
            const skillFilePath = path.join(skillsDir, entry.path);
            if (fs.existsSync(skillFilePath)) {
              const skillContent = fs.readFileSync(skillFilePath, "utf-8");
              const fmMatch = skillContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
              if (fmMatch) {
                try {
                  const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
                  skills.push({
                    name: String(entry.name),
                    toolName: String(entry.name).replace(/-/g, "_"),
                    description: String(fm.description ?? entry.description ?? ""),
                    inputSchema: { type: "object", properties: {}, required: [] },
                    tags: entry.tags as string[] | undefined,
                  });
                } catch {
                  skills.push({
                    name: String(entry.name),
                    toolName: String(entry.name).replace(/-/g, "_"),
                    description: String(entry.description ?? ""),
                    inputSchema: { type: "object", properties: {}, required: [] },
                  });
                }
              }
            }
          }
        } catch {}
      }
    }
  }

  return {
    metadata: {
      id: String(meta.id ?? path.basename(dir).toLowerCase()),
      name: String(meta.name ?? path.basename(dir)),
      version: String(meta.version ?? "1.0.0"),
      description: String(meta.description ?? ""),
      author: meta.author as string | undefined,
      tags: meta.tags as string[] | undefined,
    },
    identity: {
      role: String(meta.name ?? path.basename(dir)),
      objective: capabilities.join("；") || "执行用户任务",
      capabilities,
      style,
    },
    safety: {
      prohibited,
      constraints: [],
      fallback: required,
    },
    skills,
    provider: { type: "baize-loop", model: "claude-sonnet-4-20250514", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    source: { type: "la", path: inputDir },
  };
}

function extractSection(content: string, heading: string): string | null {
  const idx = content.indexOf(heading);
  if (idx === -1) return null;
  const afterHeading = content.slice(idx + heading.length);
  const nextH2 = afterHeading.search(/\n## /);
  return nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);
}

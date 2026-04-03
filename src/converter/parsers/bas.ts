/**
 * BAS 格式解析器
 * 输入: AGENT.md + BAS.yaml 目录
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { LIASManifest } from "../../types/ir.js";

export function parseBAS(inputDir: string): LIASManifest {
  const agentMdPath = path.join(inputDir, "AGENT.md");
  const basYamlPath = path.join(inputDir, "BAS.yaml");

  const agentMd = fs.readFileSync(agentMdPath, "utf-8");
  const basYaml = yaml.load(fs.readFileSync(basYamlPath, "utf-8")) as Record<string, unknown>;

  // 解析 BAS.yaml 元数据
  const metadata = extractMetadata(basYaml);
  const collaboration = extractCollaboration(basYaml);

  // 解析 AGENT.md 角色信息
  const identity = extractIdentityFromMd(agentMd);
  const objective = identity.capabilities.join("；") || `执行 ${identity.role} 相关任务`;
  const safetyRaw = extractSafetyFromMd(agentMd);
  const skillsRaw = extractSkillsFromBAS(basYaml);

  return {
    metadata,
    identity: {
      role: identity.role,
      objective,
      personality: identity.personality,
      vibe: identity.vibe,
      capabilities: identity.capabilities,
      style: identity.style,
    },
    safety: {
      prohibited: safetyRaw?.forbidden ?? [],
      constraints: [],
      fallback: safetyRaw?.required ?? [],
    },
    skills: skillsRaw,
    collaboration,
    provider: { type: "baize-loop", model: "claude-sonnet-4-20250514", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    source: { type: "bas", path: inputDir },
  };
}

function extractMetadata(basYaml: Record<string, unknown>) {
  const meta = (basYaml as Record<string, Record<string, unknown>>);
  return {
    id: String(meta.id ?? meta.metadata?.id ?? "unknown-agent"),
    name: String(meta.name ?? meta.metadata?.name ?? "未命名 Agent"),
    version: String(meta.version ?? meta.metadata?.version ?? "1.0.0"),
    description: String(meta.description ?? meta.metadata?.description ?? ""),
    author: meta.author ? String(meta.author) : undefined,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : undefined,
  };
}

function extractCognitive(basYaml: Record<string, unknown>) {
  const cog = basYaml.cognitive as Record<string, unknown> | undefined;
  if (!cog) return undefined;
  return {
    role: (cog.role as "executor" | "advisor" | "orchestrator") ?? "executor",
    personality: Array.isArray(cog.personality) ? cog.personality.map(String) : undefined,
    reasoning: cog.reasoning as string | undefined,
  };
}

function extractDomains(basYaml: Record<string, unknown>) {
  const dom = basYaml.domains as Record<string, unknown> | undefined;
  if (!dom) return undefined;
  return {
    primary: String(dom.primary ?? "general"),
    secondary: Array.isArray(dom.secondary) ? dom.secondary.map(String) : undefined,
  };
}

function extractCollaboration(basYaml: Record<string, unknown>) {
  const handoff = basYaml.handoff as Record<string, unknown> | undefined;
  if (!handoff) return undefined;

  const handoffsTo = Array.isArray(handoff.handoffs_to)
    ? handoff.handoffs_to.map((h: Record<string, string>) => ({
        agent: h.agent ?? h.target ?? "",
        trigger: h.trigger ?? h.condition ?? "",
      }))
    : undefined;

  const receivesFrom = Array.isArray(handoff.receives_from)
    ? handoff.receives_from.map(String)
    : undefined;

  return { handoffsTo, receivesFrom };
}

function extractIdentityFromMd(content: string): { role: string; objective?: string; personality?: string; vibe?: string; capabilities: string[]; style: string[] } {
  const capabilities: string[] = [];
  const style: string[] = [];
  let role = "";
  let personality: string | undefined;
  let vibe: string | undefined;

  // 提取角色
  const roleMatch = content.match(/(?:角色|Role|身份)[：:]\s*(.+)/i);
  if (roleMatch) role = roleMatch[1].trim();

  // 提取性格
  const persMatch = content.match(/(?:性格|Personality)[：:]\s*(.+)/i);
  if (persMatch) personality = persMatch[1].trim();

  // 提取 Vibe
  const vibeMatch = content.match(/(?:Vibe|风格描述)[：:]\s*(.+)/i);
  if (vibeMatch) vibe = vibeMatch[1].trim();

  // 提取核心使命/能力
  const sections = content.split(/^##\s+/m);
  for (const section of sections) {
    if (/核心使命|能力|Capabilities/i.test(section)) {
      const items = section.split("\n").filter(l => l.trim().startsWith("-"));
      capabilities.push(...items.map(l => l.replace(/^[-*]\s*/, "").trim()));
    }
    if (/沟通风格|工作风格|风格|Style/i.test(section)) {
      const items = section.split("\n").filter(l => l.trim().startsWith("-"));
      style.push(...items.map(l => l.replace(/^[-*]\s*/, "").trim()));
    }
  }

  if (!role && capabilities.length === 0) {
    // 尝试从标题提取
    const titleMatch = content.match(/^#\s+(.+)/m);
    if (titleMatch) role = titleMatch[1].trim();
  }

  return {
    role: role || "未定义角色",
    personality,
    vibe,
    capabilities: capabilities.length > 0 ? capabilities : ["通用能力"],
    style: style.length > 0 ? style : ["专业规范"],
  };
}

function extractSafetyFromMd(content: string): { forbidden: string[]; required: string[] } | undefined {
  const forbidden: string[] = [];
  const required: string[] = [];

  const sections = content.split(/^##\s+/m);
  for (const section of sections) {
    if (/关键规则|禁止|安全|Safety|Rules/i.test(section)) {
      const items = section.split("\n").filter(l => l.trim().startsWith("-"));
      for (const item of items) {
        const text = item.replace(/^[-*]\s*/, "").replace(/[❌✅⚠️]/g, "").trim();
        if (/禁止|不得|不可|never|forbidden/i.test(item)) {
          forbidden.push(text);
        } else if (/必须|always|required/i.test(item)) {
          required.push(text);
        } else {
          required.push(text);
        }
      }
    }
  }

  if (forbidden.length === 0 && required.length === 0) return undefined;
  return { forbidden, required };
}

function extractSkillsFromBAS(basYaml: Record<string, unknown>): import("../../types/ir.js").LIASSkill[] {
  const skillBinding = basYaml.skill_binding as Record<string, unknown> | undefined;
  if (!skillBinding) return [];

  const defaultSkills = skillBinding.default_skills as string[] | undefined;
  if (!defaultSkills || !Array.isArray(defaultSkills)) return [];

  return defaultSkills.map(name => ({
    name: toKebabCase(name),
    toolName: toSnakeCase(name),
    description: `${name} 技能`,
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  }));
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
}

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}

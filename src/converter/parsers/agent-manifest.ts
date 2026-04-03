/**
 * AGENT.md 格式解析器
 *
 * 解析 AGENT.md 文件（Markdown + YAML Frontmatter）→ LIASManifest
 *
 * 格式规范：
 * - YAML frontmatter：结构化元数据
 * - Markdown body：可选的人类可读描述
 * - 不含行为/prompt 内容（prompt 存储在 prompts/system.md）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { LIASManifest, LIASSkill } from "../../types/ir.js";

export function parseAgentManifest(filePath: string): LIASManifest {
  const content = fs.readFileSync(filePath, "utf-8");

  // 1. 解析 YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let frontmatter: Record<string, unknown> = {};
  if (fmMatch) {
    try {
      frontmatter = yaml.load(fmMatch[1]) as Record<string, unknown>;
    } catch {
      frontmatter = parseFmFallback(fmMatch[1]);
    }
  }
  const body = fmMatch ? content.slice(fmMatch[0].length).trim() : content;

  // 2. 从文件路径提取分类目录（sourceCategory → domain.primary）
  const sourceCategory = extractCategoryFromPath(filePath);

  // 3. 元数据
  const name = String(frontmatter.name ?? path.basename(path.dirname(filePath)));
  const id = String(frontmatter.id ?? toKebabCase(name));
  const version = String(frontmatter.version ?? "1.0.0");
  const description = String(frontmatter.description ?? "");
  const author = frontmatter.author as string | undefined;
  const tagsRaw = frontmatter.tags as string | string[] | undefined;
  const tags = normalizeToArray(tagsRaw);

  // 4. Domain 解析
  let domainPrimary = sourceCategory;
  let domainSecondary: string[] = [];
  if (frontmatter.domain) {
    const d = frontmatter.domain as Record<string, unknown>;
    if (typeof d === "object" && d !== null) {
      domainPrimary = String((d as Record<string, unknown>).primary ?? d.primary ?? sourceCategory ?? "general");
      const sec = (d as Record<string, unknown>).secondary;
      domainSecondary = normalizeToArray(sec as string | string[] | undefined);
    } else if (typeof d === "string") {
      domainPrimary = d;
    }
  }

  // 5. Provider 解析
  let providerType: LIASManifest["provider"] = undefined;
  if (frontmatter.provider) {
    const p = frontmatter.provider as Record<string, unknown>;
    if (typeof p === "object" && p !== null) {
      providerType = {
        type: ((p.type as string) ?? "claude") as "claude" | "openai" | "glm" | "baize-loop",
        model: p.model as string | undefined,
        apiKeyEnvVar: p.apiKeyEnvVar as string | undefined,
      };
    }
  }

  // 6. Harness 解析
  let harness: LIASManifest["harness"] = undefined;
  if (frontmatter.harness) {
    const h = frontmatter.harness as Record<string, unknown>;
    if (typeof h === "object" && h !== null) {
      harness = {
        maxIterations: h.maxIterations as number | undefined,
        maxTokens: h.maxTokens as number | undefined,
        temperature: h.temperature as number | undefined,
      };
    }
  }

  // 7. Skills 解析
  const skills = parseSkillsFromManifest(frontmatter, body);

  // 8. Collaboration 解析
  let collaboration: LIASManifest["collaboration"] = undefined;
  if (frontmatter.collaboration) {
    const c = frontmatter.collaboration as Record<string, unknown>;
    if (typeof c === "object" && c !== null) {
      const handoffsTo = normalizeToArray(c.handoffsTo as string | string[] | undefined).map((h: string) => {
        const parts = h.split("--").map((s: string) => s.trim());
        return { agent: parts[0] ?? h, trigger: parts[1] ?? "" };
      });
      const receivesFrom = normalizeToArray(c.receivesFrom as string | string[] | undefined);
      if (handoffsTo.length > 0 || receivesFrom.length > 0) {
        collaboration = { handoffsTo, receivesFrom };
      }
    }
  }

  return {
    metadata: {
      id,
      name,
      version,
      description,
      author,
      tags: tags.length > 0 ? tags : undefined,
      sourceCategory,
    },
    identity: {
      role: name,
      objective: description || `执行 ${name} 相关任务`,
      capabilities: skills.map(s => s.description),
      style: [],
    },
    safety: {
      prohibited: [],
      constraints: [],
      fallback: [],
    },
    skills,
    provider: providerType,
    harness,
    collaboration,
    source: { type: "agent-md", path: filePath, originalContent: content },
  };
}

// ── 内部工具函数 ──────────────────────────────────────────

function extractCategoryFromPath(filePath: string): string | undefined {
  const parts = filePath.split(path.sep);
  const agencyIdx = parts.findIndex(p => p === "agency-agents");
  if (agencyIdx >= 0 && agencyIdx + 1 < parts.length) {
    return parts[agencyIdx + 1];
  }
  return undefined;
}

function parseSkillsFromManifest(fm: Record<string, unknown>, body: string): LIASSkill[] {
  const skills: LIASSkill[] = [];

  // 从 frontmatter.skills 解析
  const skillsFm = fm.skills as Record<string, unknown> | string[] | undefined;
  if (skillsFm) {
    if (Array.isArray(skillsFm)) {
      // 字符串数组
      for (const s of skillsFm) {
        const skillName = String(s);
        skills.push({
          name: toKebabCase(skillName),
          toolName: toSnakeCase(skillName),
          description: skillName,
          inputSchema: { type: "object", properties: {}, required: [] },
        });
      }
    } else if (typeof skillsFm === "object" && skillsFm !== null) {
      const sf = skillsFm as Record<string, unknown>;
      // required 列表
      const required = normalizeToArray(sf.required as string | string[] | undefined);
      for (const r of required) {
        const skillName = String(r);
        skills.push({
          name: toKebabCase(skillName),
          toolName: toSnakeCase(skillName),
          description: skillName,
          inputSchema: { type: "object", properties: {}, required: [] },
        });
      }
      // optional 列表
      const optional = normalizeToArray(sf.optional as string | string[] | undefined);
      for (const r of optional) {
        const skillName = String(r);
        skills.push({
          name: toKebabCase(skillName),
          toolName: toSnakeCase(skillName),
          description: skillName,
          inputSchema: { type: "object", properties: {}, required: [] },
        });
      }
    }
  }

  return skills;
}

function parseFmFallback(fmText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = fmText.split("\n");
  let currentKey = "";
  let buffer: string[] = [];

  for (const line of lines) {
    // 缩进行属于上一个 key
    if (line.match(/^\s{2,}/) && currentKey) {
      buffer.push(line);
      continue;
    }
    // _flush buffer
    if (currentKey && buffer.length > 0) {
      result[currentKey] = buffer.join("\n").trim();
      buffer = [];
    }
    // 新 key: value 行
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val) {
        result[currentKey] = val;
        currentKey = "";
      }
    }
  }
  if (currentKey && buffer.length > 0) {
    result[currentKey] = buffer.join("\n").trim();
  }
  return result;
}

function normalizeToArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toKebabCase(str: string): string {
  const cleaned = str
    .replace(/'/g, "").replace(/"/g, "")
    .replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/\u2212/g, "-").replace(/---/g, "-").replace(/--/g, "-")
    .replace(/\u00D7/g, "-").replace(/\u2192/g, "-").replace(/\+/g, "-")
    .replace(/[&()[\]{}|<>!@#$%^*=]/g, " ")
    .replace(/[./\\]/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ").trim();
  return cleaned
    .replace(/^-+|-+$/g, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .replace(/^(\d)/, "n-$1");
}

function toSnakeCase(str: string): string {
  const cleaned = str
    .replace(/'/g, "").replace(/"/g, "")
    .replace(/\u2014/g, "-").replace(/\u2013/g, "-").replace(/\u2212/g, "-").replace(/---/g, "-").replace(/--/g, "-")
    .replace(/\u00D7/g, "-").replace(/\u2192/g, "-").replace(/\+/g, "-")
    .replace(/[&()[\]{}|<>!@#$%^*=]/g, " ")
    .replace(/[./\\]/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ").trim();
  return cleaned
    .replace(/^-+|-+$/g, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .replace(/^(\d)/, "n_$1");
}

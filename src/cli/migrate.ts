/**
 * agent-forge migrate — agent.yaml → AGENT.md 迁移工具
 *
 * 读取 agent.yaml + prompts/system.md，生成 AGENT.md
 * 可选删除原始 agent.yaml
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

export interface MigrateOptions {
  input: string;
  delete?: boolean;
  batch?: boolean;
  verbose?: boolean;
}

export interface MigrateResult {
  success: boolean;
  input: string;
  output: string;
  deleted?: string;
  errors: string[];
  warnings: string[];
}

/**
 * 迁移单个 Agent 目录
 */
export function migrate(options: MigrateOptions): MigrateResult {
  const { input, delete: shouldDelete, verbose } = options;
  const dir = path.resolve(input);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(dir)) {
    return { success: false, input, output: "", errors: [`路径不存在: ${dir}`], warnings: [] };
  }

  const agentYamlPath = path.join(dir, "agent.yaml");
  const agentMdPath = path.join(dir, "AGENT.md");
  const systemMdPath = path.join(dir, "prompts", "system.md");

  if (!fs.existsSync(agentYamlPath)) {
    return { success: false, input, output: "", errors: [`agent.yaml 不存在: ${agentYamlPath}`], warnings: [] };
  }

  // 解析 agent.yaml
  let agentYaml: Record<string, unknown>;
  try {
    agentYaml = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
  } catch (e) {
    return {
      success: false,
      input,
      output: "",
      errors: [`解析 agent.yaml 失败: ${e instanceof Error ? e.message : String(e)}`],
      warnings: [],
    };
  }

  // 读取 prompts/system.md（用于提取 description 等信息）
  let systemContent = "";
  if (fs.existsSync(systemMdPath)) {
    systemContent = fs.readFileSync(systemMdPath, "utf-8");
  }

  // 生成 AGENT.md
  const agentMd = generateAgentMd(agentYaml, systemContent);
  let deleted: string | undefined;

  try {
    fs.writeFileSync(agentMdPath, agentMd, "utf-8");
    if (verbose) console.log(`  生成: ${agentMdPath}`);
  } catch (e) {
    errors.push(`写入 AGENT.md 失败: ${e instanceof Error ? e.message : String(e)}`);
    return { success: false, input, output: agentMdPath, errors, warnings };
  }

  // 可选删除 agent.yaml
  if (shouldDelete) {
    try {
      fs.unlinkSync(agentYamlPath);
      deleted = agentYamlPath;
      if (verbose) console.log(`  删除: ${agentYamlPath}`);
    } catch (e) {
      warnings.push(`删除 agent.yaml 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { success: true, input, output: agentMdPath, deleted, errors, warnings };
}

/**
 * 生成 AGENT.md 内容
 */
function generateAgentMd(agentYaml: Record<string, unknown>, systemContent: string): string {
  const meta = (agentYaml.metadata ?? agentYaml) as Record<string, unknown>;

  const id = String(meta.id ?? "");
  const name = String(meta.name ?? meta.id ?? "Unnamed Agent");
  const version = String(meta.version ?? "1.0.0");
  const author = String(meta.author ?? "Wel");
  const rawDesc = String(meta.description ?? extractDescriptionFromSystem(systemContent));
  // 引号包裹 description，避免 YAML 解析器因冒号、换行符等字符报错
  const safeDesc = rawDesc.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const description = `"${safeDesc}"`;

  // Tags
  const tagsRaw = meta.tags;
  let tagsLine = "";
  if (tagsRaw) {
    const tags = Array.isArray(tagsRaw) ? tagsRaw : String(tagsRaw).split(",").map(s => s.trim());
    if (Array.isArray(tags) && tags.length > 0) {
      tagsLine = `\ntags: ${tags.map(t => `"${t}"`).join(", ")}`;
    }
  }

  // Domain
  const domain = meta.domains ?? meta.domain;
  let domainSection = "";
  if (domain) {
    if (typeof domain === "string") {
      domainSection = `\ndomain:\n  primary: ${domain}`;
    } else if (Array.isArray(domain)) {
      domainSection = `\ndomain:\n  primary: ${domain[0] ?? "general"}\n  secondary: ${domain.slice(1).join(", ")}`;
    } else if (typeof domain === "object" && domain !== null) {
      const d = domain as Record<string, unknown>;
      const primary = String(d.primary ?? d.domain ?? "general");
      const secondary = d.secondary ?? "";
      if (secondary) {
        const secStr = Array.isArray(secondary) ? secondary.join(", ") : String(secondary);
        domainSection = `\ndomain:\n  primary: ${primary}\n  secondary: ${secStr}`;
      } else {
        domainSection = `\ndomain:\n  primary: ${primary}`;
      }
    }
  }

  // Provider
  const provider = meta.provider as Record<string, unknown> | undefined;
  let providerSection = "";
  if (provider) {
    const ptype = String(provider.type ?? "claude");
    const pmodel = String(provider.model ?? "claude-sonnet-4-20250514");
    const pkey = provider.apiKeyEnvVar ? String(provider.apiKeyEnvVar) : "ANTHROPIC_API_KEY";
    providerSection = `\nprovider:\n  type: ${ptype}\n  model: ${pmodel}\n  apiKeyEnvVar: ${pkey}`;
  }

  // Harness
  const harness = meta.harness as Record<string, unknown> | undefined;
  let harnessSection = "";
  if (harness) {
    const maxIter = harness.maxIterations ? String(harness.maxIterations) : "10";
    const maxTok = harness.maxTokens ? String(harness.maxTokens) : "8192";
    const temp = harness.temperature ? String(harness.temperature) : "0.3";
    harnessSection = `\nharness:\n  maxIterations: ${maxIter}\n  maxTokens: ${maxTok}\n  temperature: ${temp}`;
  }

  // Skills
  const skills = meta.skills as Record<string, unknown> | string[] | undefined;
  let skillsSection = "";
  if (skills) {
    if (Array.isArray(skills)) {
      skillsSection = `\nskills:\n  - ${skills.map(s => String(s)).join(`\n  - `)}`;
    } else if (typeof skills === "object" && skills !== null) {
      const sf = skills as Record<string, unknown>;
      const req = sf.required as string[] | undefined;
      const opt = sf.optional as string[] | undefined;
      if (req && req.length > 0) {
        skillsSection += `\nskills:\n  required:`;
        for (const r of req) {
          skillsSection += `\n    - ${r}`;
        }
      }
      if (opt && opt.length > 0) {
        if (!skillsSection) skillsSection = "\nskills:";
        skillsSection += `\n  optional:`;
        for (const o of opt) {
          skillsSection += `\n    - ${o}`;
        }
      }
    }
  }

  // Collaboration
  const collab = meta.collaboration as Record<string, unknown> | undefined;
  let collabSection = "";
  if (collab) {
    const handoffs = collab.handoffsTo as string[] | undefined;
    const receives = collab.receivesFrom as string[] | undefined;
    if (handoffs && handoffs.length > 0) {
      collabSection += `\ncollaboration:\n  handoffsTo:`;
      for (const h of handoffs) {
        const parts = String(h).split("--").map(s => s.trim());
        collabSection += `\n    - "${parts[0]}"${parts[1] ? ` -- ${parts[1]}` : ""}`;
      }
    }
    if (receives && receives.length > 0) {
      if (!collabSection) collabSection = "\ncollaboration:";
      collabSection += `\n  receivesFrom:`;
      for (const r of receives) {
        collabSection += `\n    - ${r}`;
      }
    }
  }

  return [
    `---`,
    `id: ${id}`,
    `name: ${name}`,
    `version: ${version}`,
    `author: ${author}`,
    `description: ${description}`,
    ...(tagsLine ? [tagsLine] : []),
    ...(domainSection ? [domainSection] : []),
    ...(providerSection ? [providerSection] : []),
    ...(harnessSection ? [harnessSection] : []),
    ...(skillsSection ? [skillsSection] : []),
    ...(collabSection ? [collabSection] : []),
    `---`,
    ``,
    `# ${name}`,
    ``,
    `## Metadata`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Description | ${description} |`,
    ``,
    `## Skills`,
    ``,
    `Skills are defined in the \`skills/\` directory.`,
  ].join("\n");
}

/**
 * 从 system.md 提取描述
 */
function extractDescriptionFromSystem(systemContent: string): string {
  if (!systemContent) return "";

  // 尝试从第一段提取
  const firstPara = systemContent.split("\n\n")[0]?.trim() ?? "";
  const cleaned = firstPara.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
  if (cleaned.length > 0 && cleaned.length < 200) {
    return cleaned;
  }

  // 尝试从 ## Identity 或 ## Role Definition 提取
  const roleMatch = systemContent.match(/^##\s+(?:Identity|Role)\s+Definition\n([^\n#]+)/im);
  if (roleMatch) {
    return roleMatch[1].trim().replace(/\*\*/g, "").slice(0, 200);
  }

  return "";
}

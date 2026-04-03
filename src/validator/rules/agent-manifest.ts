/**
 * AGENT.md 验证规则
 * L070-L079: AGENT.md 格式专项检查
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { ValidationIssue } from "../../types/index.js";

/**
 * 验证 AGENT.md 格式规范
 */
export function validateAgentManifest(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const agentManifestPath = path.join(agentDir, "AGENT.md");
  const agentYamlPath = path.join(agentDir, "agent.yaml");
  const hasAgentManifest = fs.existsSync(agentManifestPath);
  const hasAgentYaml = fs.existsSync(agentYamlPath);

  // L070: AGENT.md 或 agent.yaml 必须存在其一
  if (!hasAgentManifest && !hasAgentYaml) {
    issues.push({
      code: "L070",
      severity: "error",
      message: "AGENT.md 或 agent.yaml 必须存在其一",
      file: agentDir,
      suggestion: "创建 AGENT.md 或 agent.yaml 作为 Agent 元数据定义",
    });
  }

  // L079: 检测到废弃的 agent.yaml，建议迁移至 AGENT.md
  if (hasAgentYaml && hasAgentManifest) {
    issues.push({
      code: "L079",
      severity: "warning",
      message: "检测到废弃的 agent.yaml，建议迁移至 AGENT.md",
      file: agentYamlPath,
      suggestion: "运行 'agent-forge migrate --input <dir> --delete' 迁移到 AGENT.md 格式",
    });
  }

  // 如果没有 AGENT.md，跳过后续格式验证
  if (!hasAgentManifest) return issues;

  // 读取并解析 AGENT.md
  let content: string;
  try {
    content = fs.readFileSync(agentManifestPath, "utf-8");
  } catch {
    issues.push({
      code: "L070",
      severity: "error",
      message: "无法读取 AGENT.md 文件",
      file: agentManifestPath,
      suggestion: "检查文件权限或文件是否损坏",
    });
    return issues;
  }

  // 提取 frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let frontmatter: Record<string, unknown> = {};
  if (fmMatch) {
    try {
      frontmatter = yaml.load(fmMatch[1]) as Record<string, unknown>;
    } catch {
      issues.push({
        code: "L070",
        severity: "error",
        message: "AGENT.md frontmatter YAML 格式错误",
        file: agentManifestPath,
        suggestion: "检查 YAML 语法，确保 --- 分隔符正确配对",
      });
      return issues;
    }
  } else {
    issues.push({
      code: "L070",
      severity: "warning",
      message: "AGENT.md 缺少 YAML frontmatter",
      file: agentManifestPath,
      suggestion: "添加 --- frontmatter --- 包裹的元数据区块",
    });
  }

  // L071: id 须为有效的 kebab-case
  const id = frontmatter.id as string | undefined;
  if (id !== undefined) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
      issues.push({
        code: "L071",
        severity: "warning",
        message: `id "${id}" 须为有效的 kebab-case（小写字母开头，仅含小写字母、数字、连字符）`,
        file: agentManifestPath,
        suggestion: `修改为如 "marketing-tiktok-strategist" 格式`,
      });
    }
  }

  // L072: version 须符合 semver 格式
  const version = frontmatter.version as string | undefined;
  if (version !== undefined) {
    if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(version)) {
      issues.push({
        code: "L072",
        severity: "warning",
        message: `version "${version}" 须符合 semver 格式（如 1.0.0）`,
        file: agentManifestPath,
        suggestion: `修改为 x.y.z 格式`,
      });
    }
  }

  // L073: domain.primary 不得为空
  const domain = frontmatter.domain as Record<string, unknown> | undefined;
  if (domain) {
    const primary = domain.primary as string | undefined;
    if (!primary || primary.trim() === "") {
      issues.push({
        code: "L073",
        severity: "warning",
        message: "domain.primary 不得为空",
        file: agentManifestPath,
        suggestion: "在 domain.primary 中指定主要领域（如 marketing, engineering 等）",
      });
    }
  }

  // L074: Skills 条目须为 kebab-case
  const skills = frontmatter.skills as Record<string, unknown> | string[] | undefined;
  if (skills) {
    const skillNames: string[] = [];
    if (Array.isArray(skills)) {
      skillNames.push(...skills.map(s => String(s)));
    } else if (typeof skills === "object" && skills !== null) {
      const sf = skills as Record<string, unknown>;
      const required = sf.required as string[] | undefined;
      const optional = sf.optional as string[] | undefined;
      if (required) skillNames.push(...required.map(s => String(s)));
      if (optional) skillNames.push(...optional.map(s => String(s)));
    }
    for (const sn of skillNames) {
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(sn)) {
        issues.push({
          code: "L074",
          severity: "warning",
          message: `Skill "${sn}" 须为 kebab-case（小写字母、数字、连字符）`,
          file: agentManifestPath,
          suggestion: `修改为如 "viral-content-creation" 格式`,
        });
      }
    }
  }

  // L075: provider.type 须为有效枚举
  const provider = frontmatter.provider as Record<string, unknown> | undefined;
  if (provider) {
    const type = provider.type as string | undefined;
    const validTypes = ["claude", "openai", "glm", "baize-loop"];
    if (type && !validTypes.includes(type)) {
      issues.push({
        code: "L075",
        severity: "warning",
        message: `provider.type "${type}" 须为有效枚举值`,
        file: agentManifestPath,
        suggestion: `有效值: ${validTypes.join(", ")}`,
      });
    }
  }

  // L076: temperature 须在 0-2 之间
  const harness = frontmatter.harness as Record<string, unknown> | undefined;
  if (harness) {
    const temp = harness.temperature as number | undefined;
    if (temp !== undefined) {
      if (typeof temp !== "number" || temp < 0 || temp > 2) {
        issues.push({
          code: "L076",
          severity: "warning",
          message: `temperature "${temp}" 须为 0-2 之间的数字`,
          file: agentManifestPath,
          suggestion: "temperature 应在 [0, 2] 范围内",
        });
      }
    }

    const maxTokens = harness.maxTokens as number | undefined;
    if (maxTokens !== undefined) {
      if (typeof maxTokens !== "number" || maxTokens <= 0 || !Number.isInteger(maxTokens)) {
        issues.push({
          code: "L077",
          severity: "warning",
          message: `maxTokens "${maxTokens}" 须为正整数`,
          file: agentManifestPath,
          suggestion: "maxTokens 应为大于 0 的整数",
        });
      }
    }

    const maxIterations = harness.maxIterations as number | undefined;
    if (maxIterations !== undefined) {
      if (typeof maxIterations !== "number" || maxIterations <= 0 || !Number.isInteger(maxIterations)) {
        issues.push({
          code: "L078",
          severity: "warning",
          message: `maxIterations "${maxIterations}" 须为正整数`,
          file: agentManifestPath,
          suggestion: "maxIterations 应为大于 0 的整数",
        });
      }
    }
  }

  return issues;
}

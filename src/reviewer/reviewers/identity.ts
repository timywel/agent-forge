/**
 * IdentityReviewer — 身份定义与 SOP 质量评审
 * 权重: 20%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewIdentity(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  const systemMdPath = path.join(agentDir, "prompts/system.md");
  const agentMdPath = path.join(agentDir, "AGENT.md");
  const agentYamlPath = path.join(agentDir, "agent.yaml");

  let systemContent = "";
  if (fs.existsSync(systemMdPath)) {
    systemContent = fs.readFileSync(systemMdPath, "utf-8");
  }

  // 提取元数据（优先 AGENT.md）
  let meta: Record<string, unknown> = {};
  if (fs.existsSync(agentMdPath)) {
    try {
      const md = fs.readFileSync(agentMdPath, "utf-8");
      const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) meta = yaml.load(fmMatch[1]) as Record<string, unknown>;
    } catch {}
  } else if (fs.existsSync(agentYamlPath)) {
    try {
      meta = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
      const m = (meta.metadata ?? meta) as Record<string, unknown>;
      meta = m;
    } catch {}
  }

  const name = String(meta.name ?? path.basename(agentDir));
  const description = String(meta.description ?? "");

  // 检查 role/objective 完整性
  if (!name || name === "" || name === "Unnamed Agent") {
    issues.push({ code: "R010", severity: "error", dimension: "identity", description: "Agent 名称缺失或无效", location: agentMdPath || agentYamlPath || agentDir, suggestion: "在 AGENT.md 或 agent.yaml 中设置 name 字段" });
    score -= 3;
  } else {
    highlights.push(`✅ Agent 名称: ${name}`);
  }

  if (!description || description.length < 10) {
    issues.push({ code: "R011", severity: "warning", dimension: "identity", description: "Agent 描述缺失或过于简短", location: agentMdPath || agentYamlPath || agentDir, suggestion: "提供完整的 1-2 句话描述 Agent 的职责和专长" });
    score -= 1.5;
  } else if (description.length > 20) {
    highlights.push("✅ Agent 描述完整");
  }

  // 检查 system.md 内容质量
  if (!systemContent) {
    issues.push({ code: "R012", severity: "error", dimension: "identity", description: "prompts/system.md 内容为空或不存在", location: systemMdPath, suggestion: "创建 prompts/system.md 定义角色、能力、风格" });
    score -= 3;
  } else {
    // 检查关键章节
    const sections = systemContent.split(/^##\s+/m);
    const headings = sections.map(s => s.split("\n")[0]?.trim().toLowerCase() ?? "");

    // Identity/Mission
    const hasIdentity = headings.some(h => h.includes("identity") || h.includes("你的身份") || h.includes("role"));
    if (!hasIdentity) {
      issues.push({ code: "R013", severity: "warning", dimension: "identity", description: "system.md 缺少 Identity/角色定义章节", location: systemMdPath, suggestion: "添加 ## Identity 章节定义 Agent 角色和目标" });
      score -= 1;
    } else {
      highlights.push("✅ 包含 Identity 定义");
    }

    // Capabilities/能力
    const hasCapabilities = headings.some(h => h.includes("capabilit") || h.includes("能力") || h.includes("mission") || h.includes("能力"));
    if (!hasCapabilities) {
      issues.push({ code: "R014", severity: "warning", dimension: "identity", description: "system.md 缺少 Capabilities/能力章节", location: systemMdPath, suggestion: "添加 ## Capabilities 章节列举 Agent 核心能力" });
      score -= 1;
    } else {
      highlights.push("✅ 包含 Capabilities 定义");
    }

    // 内容充实度检查
    if (systemContent.length < 500) {
      issues.push({ code: "R015", severity: "warning", dimension: "identity", description: `system.md 内容过短（${systemContent.length} 字符），可能缺乏足够的角色定义`, location: systemMdPath, suggestion: "扩展 system.md 内容，提供更详细的角色、能力、风格定义" });
      score -= 0.5;
    } else if (systemContent.length > 2000) {
      highlights.push(`✅ system.md 内容充实（${systemContent.length} 字符）`);
    }

    // 检查列表项数量（capabilities 应有足够数量）
    const bulletCount = (systemContent.match(/^\s*[-*]\s+/gm) ?? []).length;
    if (bulletCount < 3) {
      issues.push({ code: "R016", severity: "warning", dimension: "identity", description: `system.md 列表项过少（${bulletCount} 项），可能缺乏能力细节`, location: systemMdPath, suggestion: "增加更多具体的能力列表项" });
      score -= 0.5;
    }
  }

  return {
    dimension: "identity",
    score: Math.max(0, score),
    weight: 20,
    issues,
    highlights,
  };
}

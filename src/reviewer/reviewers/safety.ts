/**
 * SafetyReviewer — 安全规范评审
 * 权重: 10%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewSafety(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  const safetyMdPath = path.join(agentDir, "prompts/safety.md");
  const safetyRulesPath = path.join(agentDir, "prompts/safety_rules.md");
  const systemMdPath = path.join(agentDir, "prompts/system.md");

  let safetyContent = "";
  let sourcePath = "";

  if (fs.existsSync(safetyMdPath)) {
    safetyContent = fs.readFileSync(safetyMdPath, "utf-8");
    sourcePath = safetyMdPath;
  } else if (fs.existsSync(safetyRulesPath)) {
    safetyContent = fs.readFileSync(safetyRulesPath, "utf-8");
    sourcePath = safetyRulesPath;
  } else if (fs.existsSync(systemMdPath)) {
    // 从 system.md 提取安全内容
    safetyContent = fs.readFileSync(systemMdPath, "utf-8");
    sourcePath = systemMdPath;
  }

  if (!safetyContent) {
    issues.push({ code: "R020", severity: "error", dimension: "safety", description: "缺少安全定义文件（safety.md / safety_rules.md）", location: agentDir, suggestion: "创建 prompts/safety.md 定义安全红线和约束" });
    return {
      dimension: "safety",
      score: 0,
      weight: 10,
      issues,
      highlights: [],
    };
  }

  // 检查 prohibited 项（跳过标题后的空行，匹配到下一章节前的所有内容）
  const prohibitedMatch = safetyContent.match(/^##?\s*(?:Prohibited|禁止|Forbidden|红线|禁忌)[^\n]*\n\n[\s\S]*?(?=\n\n[^ \t\n])/im);
  const prohibitedItems = prohibitedMatch
    ? (prohibitedMatch[0].match(/^\s*[-*]\s+(.+)/gm) ?? [])
    : [];
  if (prohibitedItems.length === 0) {
    issues.push({ code: "R021", severity: "warning", dimension: "safety", description: "缺少禁止行为（Prohibited）定义", location: sourcePath, suggestion: "添加禁止行为列表，如：禁止访问外部 API、禁止修改系统文件等" });
    score -= 2;
  } else if (prohibitedItems.length >= 3) {
    highlights.push(`✅ 禁止行为定义完整（${prohibitedItems.length} 项）`);
  } else {
    issues.push({ code: "R022", severity: "info", dimension: "safety", description: `禁止行为定义较少（${prohibitedItems.length} 项）`, location: sourcePath, suggestion: "建议添加更多禁止行为" });
    score -= 0.5;
  }

  // 检查 fallback/拒绝逻辑
  const hasFallback = /fallback|拒绝|unable to|cannot fulfill|reject|超出范围|超出能力/i.test(safetyContent);
  if (!hasFallback) {
    issues.push({ code: "R023", severity: "warning", dimension: "safety", description: "缺少 Fallback Logic（拒绝逻辑）", location: sourcePath, suggestion: "添加当无法满足请求时的拒绝/降级逻辑" });
    score -= 1.5;
  } else {
    highlights.push("✅ Fallback Logic 存在");
  }

  // 检查安全章节格式（BaizeAgent v2 使用 ❌/✅ 标记）
  const hasXmark = safetyContent.includes("❌");
  const hasCheckmark = safetyContent.includes("✅");
  if (hasXmark || hasCheckmark) {
    highlights.push("✅ 使用 BaizeAgent v2 安全标记格式");
  }

  // 内容充实度
  if (safetyContent.length < 100) {
    issues.push({ code: "R024", severity: "warning", dimension: "safety", description: `安全内容过短（${safetyContent.length} 字符）`, location: sourcePath, suggestion: "扩展安全定义，提供更详细的约束条件" });
    score -= 1;
  } else {
    highlights.push(`✅ 安全定义充实（${safetyContent.length} 字符）`);
  }

  return {
    dimension: "safety",
    score: Math.max(0, score),
    weight: 10,
    issues,
    highlights,
  };
}

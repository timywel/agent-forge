/**
 * LIAS Safety 质量分析器
 * 评估 safety.md 的 Prohibited Actions + Fallback 完整性
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";

export function analyzeSafety(agentDir: string): { score: number; improvements: Improvement[] } {
  const improvements: Improvement[] = [];
  let score = 100;

  const safetyMdPath = path.join(agentDir, "prompts", "safety.md");
  if (!fs.existsSync(safetyMdPath)) {
    return { score: 0, improvements: [{ id: "SF001", category: "safety", description: "缺少 safety.md", severity: "error", autoFixable: false, applied: false }] };
  }

  const content = fs.readFileSync(safetyMdPath, "utf-8");

  // Prohibited Actions 检查
  const hasProhibited = content.includes("Prohibited") || content.includes("禁止") || content.includes("❌");
  if (!hasProhibited) {
    score -= 35;
    improvements.push({ id: "SF002", category: "safety", description: "缺少 Prohibited Actions 章节", severity: "error", autoFixable: true, applied: false, file: safetyMdPath });
  } else {
    // 统计禁止项数量
    const prohibitedItems = content.split("\n").filter(l => l.includes("❌") || l.match(/^\s*-\s*❌/)).length;
    if (prohibitedItems < 3) {
      score -= 10;
      improvements.push({ id: "SF003", category: "safety", description: `禁止项过少（${prohibitedItems} 项），建议至少 3 项`, severity: "warning", autoFixable: true, applied: false, file: safetyMdPath });
    }
  }

  // Domain Constraints 检查
  const hasConstraints = content.includes("Domain Constraint") || content.includes("范围") || content.includes("constraint");
  if (!hasConstraints) {
    score -= 15;
    improvements.push({ id: "SF004", category: "safety", description: "缺少 Domain Constraints 章节", severity: "warning", autoFixable: true, applied: false, file: safetyMdPath });
  }

  // Fallback 检查
  const hasFallback = content.toLowerCase().includes("fallback") || content.includes("拒绝") || content.includes("apologize");
  if (!hasFallback) {
    score -= 20;
    improvements.push({ id: "SF005", category: "safety", description: "缺少 Fallback 逻辑", severity: "warning", autoFixable: true, applied: false, file: safetyMdPath });
  }

  // 行数检查
  const lines = content.split("\n").length;
  if (lines < 5) {
    score -= 15;
    improvements.push({ id: "SF006", category: "safety", description: `safety.md 过短（${lines} 行）`, severity: "warning", autoFixable: true, applied: false, file: safetyMdPath });
  }

  return { score: Math.max(0, score), improvements };
}

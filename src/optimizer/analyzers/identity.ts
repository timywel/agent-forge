/**
 * LIAS Identity 质量分析器
 * 评估 system.md 的 Identity/Objective/SOP/Output Format 完整性
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";

export function analyzeIdentity(agentDir: string): { score: number; improvements: Improvement[] } {
  const improvements: Improvement[] = [];
  let score = 100;

  const systemMdPath = path.join(agentDir, "prompts", "system.md");
  if (!fs.existsSync(systemMdPath)) {
    return { score: 0, improvements: [{ id: "I001", category: "identity", description: "缺少 system.md", severity: "error", autoFixable: false, applied: false }] };
  }

  const content = fs.readFileSync(systemMdPath, "utf-8");

  // Identity 章节检查
  const hasIdentity = /#{1,3}\s+.*Identity.*/.test(content) || /#{1,3}\s+.*身份.*/.test(content);
  if (!hasIdentity) {
    score -= 25;
    improvements.push({ id: "I002", category: "identity", description: "缺少 Identity 章节", severity: "error", autoFixable: true, applied: false, file: systemMdPath });
  }

  // Objective 章节检查
  const hasObjective = /#{1,3}\s+.*Objective.*/.test(content) || /#{1,3}\s+.*目标.*/.test(content);
  if (!hasObjective) {
    score -= 25;
    improvements.push({ id: "I003", category: "identity", description: "缺少 Objective 章节", severity: "error", autoFixable: true, applied: false, file: systemMdPath });
  }

  // SOP 检查
  const hasSOP = /#{1,3}\s+.*SOP.*/.test(content) || /#{1,3}\s+.*Standard Operating Procedure.*/.test(content) || /#{1,3}\s+.*流程.*/.test(content);
  if (!hasSOP) {
    score -= 15;
    improvements.push({ id: "I004", category: "identity", description: "缺少 SOP（标准操作步骤）", severity: "warning", autoFixable: true, applied: false, file: systemMdPath });
  }

  // Output Format 检查
  const hasOutputFormat = /#{1,3}\s+.*Output.*Format.*/.test(content) || /#{1,3}\s+.*输出格式.*/.test(content);
  if (!hasOutputFormat) {
    score -= 10;
    improvements.push({ id: "I005", category: "identity", description: "缺少 Output Format 章节", severity: "warning", autoFixable: true, applied: false, file: systemMdPath });
  }

  // 行数评分
  const lines = content.split("\n").length;
  if (lines < 20) {
    score -= 15;
    improvements.push({ id: "I006", category: "identity", description: `system.md 过短（${lines} 行），建议 20-100 行`, severity: "warning", autoFixable: true, applied: false, file: systemMdPath });
  } else if (lines > 100) {
    score -= 5;
    improvements.push({ id: "I007", category: "identity", description: `system.md 过长（${lines} 行），建议不超过 100 行`, severity: "info", autoFixable: true, applied: false, file: systemMdPath });
  }

  return { score: Math.max(0, score), improvements };
}

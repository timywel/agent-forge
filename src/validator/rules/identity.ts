/**
 * LIAS Identity 和 Safety 验证规则
 * 验证 prompts/system.md 和 prompts/safety.md 内容
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationIssue } from "../../types/index.js";

export function validateIdentity(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const systemMdPath = path.join(agentDir, "prompts", "system.md");

  if (!fs.existsSync(systemMdPath)) {
    return issues; // 结构验证已报错
  }

  const content = fs.readFileSync(systemMdPath, "utf-8");

  // L040: system.md 必须包含 # Identity 或 ## Identity
  if (!hasHeading(content, "Identity") && !hasHeading(content, "身份")) {
    issues.push({
      code: "L040",
      severity: "error",
      message: 'system.md 须包含 "Identity" 或 "身份" 章节',
      file: systemMdPath,
    });
  }

  // L041: system.md 必须包含 # Objective 或 ## Objective 或 ## Objective
  if (!hasHeading(content, "Objective") && !hasHeading(content, "目标")) {
    issues.push({
      code: "L041",
      severity: "error",
      message: 'system.md 须包含 "Objective" 或 "目标" 章节',
      file: systemMdPath,
    });
  }

  // L042: system.md 推荐包含 SOP
  if (!hasHeading(content, "Standard Operating Procedure") &&
      !hasHeading(content, "SOP") &&
      !hasHeading(content, "流程") &&
      !hasHeading(content, "Procedure")) {
    issues.push({
      code: "L042",
      severity: "warning",
      message: 'system.md 推荐包含 SOP（标准操作步骤）',
      file: systemMdPath,
    });
  }

  // L043: 行数检查（20-100 行）
  const lines = content.split("\n").length;
  if (lines < 20) {
    issues.push({
      code: "L043",
      severity: "warning",
      message: `system.md 过短: ${lines} 行（建议 20-100 行）`,
      file: systemMdPath,
    });
  }

  return issues;
}

export function validateSafety(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const safetyMdPath = path.join(agentDir, "prompts", "safety.md");

  if (!fs.existsSync(safetyMdPath)) {
    return issues; // 结构验证已报错
  }

  const content = fs.readFileSync(safetyMdPath, "utf-8");

  // L050: safety.md 必须包含 Prohibited Actions
  if (!content.includes("Prohibited") && !content.includes("禁止")) {
    issues.push({
      code: "L050",
      severity: "error",
      message: 'safety.md 须包含 "Prohibited Actions" 或 "禁止" 章节',
      file: safetyMdPath,
    });
  }

  // L051: safety.md 应包含 Fallback 或拒绝逻辑
  if (!content.toLowerCase().includes("fallback") && !content.includes("拒绝")) {
    issues.push({
      code: "L051",
      severity: "warning",
      message: 'safety.md 推荐包含 Fallback 或拒绝逻辑',
      file: safetyMdPath,
    });
  }

  return issues;
}

function hasHeading(content: string, keyword: string): boolean {
  const pattern = new RegExp(`^#{1,3}\\s+.*${keyword}.*`, "im");
  return pattern.test(content);
}

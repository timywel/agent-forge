/**
 * LIAS 结构验证规则
 * 检查 Agent 目录结构是否完整
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationIssue } from "../../types/index.js";

export function validateStructure(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // L001: main.ts 必须存在
  const mainTsPath = path.join(agentDir, "main.ts");
  if (!fs.existsSync(mainTsPath)) {
    issues.push({
      code: "L001",
      severity: "error",
      message: "main.ts 必须存在",
      file: mainTsPath,
      suggestion: "创建 main.ts 作为 Agent 入口点",
    });
  }

  // L002: prompts/system.md 必须存在
  const systemMdPath = path.join(agentDir, "prompts", "system.md");
  if (!fs.existsSync(systemMdPath)) {
    issues.push({
      code: "L002",
      severity: "error",
      message: "prompts/system.md 必须存在",
      file: systemMdPath,
      suggestion: "创建 prompts/system.md 角色定义文件",
    });
  }

  // L003: prompts/safety.md 必须存在
  const safetyMdPath = path.join(agentDir, "prompts", "safety.md");
  if (!fs.existsSync(safetyMdPath)) {
    issues.push({
      code: "L003",
      severity: "error",
      message: "prompts/safety.md 必须存在",
      file: safetyMdPath,
      suggestion: "创建 prompts/safety.md 安全红线文件",
    });
  }

  // L004: src/ 目录必须存在
  const srcDir = path.join(agentDir, "src");
  if (!fs.existsSync(srcDir)) {
    issues.push({
      code: "L004",
      severity: "error",
      message: "src/ 目录必须存在",
      file: srcDir,
      suggestion: "创建 src/ 目录包含 types.ts, loop.ts, provider.ts",
    });
  }

  // L005: package.json 必须存在
  const packageJsonPath = path.join(agentDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    issues.push({
      code: "L005",
      severity: "error",
      message: "package.json 必须存在",
      file: packageJsonPath,
      suggestion: "创建 package.json 包含 type: module 和必要的依赖",
    });
  }

  // L006: skills/ 目录推荐存在
  const skillsDir = path.join(agentDir, "skills");
  if (!fs.existsSync(skillsDir)) {
    issues.push({
      code: "L006",
      severity: "warning",
      message: "skills/ 目录推荐存在（可选但推荐）",
      file: skillsDir,
      suggestion: "创建 skills/ 目录包含原子化能力集",
    });
  }

  return issues;
}

/**
 * LIAS 运行时验证规则
 * 验证 src/loop.ts 和 src/provider.ts 的存在性和基本格式
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationIssue } from "../../types/index.js";

export function validateRuntime(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const srcDir = path.join(agentDir, "src");

  if (!fs.existsSync(srcDir)) {
    return issues; // 结构验证已报错
  }

  // L060: src/loop.ts 必须存在
  const loopPath = path.join(srcDir, "loop.ts");
  if (!fs.existsSync(loopPath)) {
    issues.push({
      code: "L060",
      severity: "error",
      message: "src/loop.ts 必须存在",
      file: loopPath,
      suggestion: "创建 src/loop.ts 实现 ReAct 循环",
    });
  }

  // L061: src/provider.ts 必须存在
  const providerPath = path.join(srcDir, "provider.ts");
  if (!fs.existsSync(providerPath)) {
    issues.push({
      code: "L061",
      severity: "error",
      message: "src/provider.ts 必须存在",
      file: providerPath,
      suggestion: "创建 src/provider.ts 配置 LLM Provider",
    });
  }

  // L062: src/types.ts 必须存在
  const typesPath = path.join(srcDir, "types.ts");
  if (!fs.existsSync(typesPath)) {
    issues.push({
      code: "L062",
      severity: "error",
      message: "src/types.ts 必须存在",
      file: typesPath,
      suggestion: "创建 src/types.ts 定义类型",
    });
  }

  // L063: loop.ts 应包含 ReAct 循环逻辑
  if (fs.existsSync(loopPath)) {
    const loopContent = fs.readFileSync(loopPath, "utf-8");
    if (!loopContent.includes("allTools") && !loopContent.includes("Tool")) {
      issues.push({
        code: "L063",
        severity: "warning",
        message: "src/loop.ts 应导入并使用 allTools",
        file: loopPath,
      });
    }
    if (!loopContent.includes("loadPrompts")) {
      issues.push({
        code: "L064",
        severity: "warning",
        message: "src/loop.ts 应使用 loadPrompts 加载提示词",
        file: loopPath,
      });
    }
  }

  return issues;
}

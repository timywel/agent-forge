/**
 * LIAS Schema 验证规则
 * 验证 package.json 和 main.ts 字段
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationIssue } from "../../types/index.js";

export function validateSchema(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // L010: package.json 必须有 "type": "module"
  const packageJsonPath = path.join(agentDir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    } catch (e) {
      issues.push({
        code: "L010",
        severity: "error",
        message: "package.json 解析失败",
        file: packageJsonPath,
      });
      return issues;
    }

    if (pkg.type !== "module") {
      issues.push({
        code: "L011",
        severity: "error",
        message: 'package.json 必须包含 "type": "module"',
        file: packageJsonPath,
        suggestion: '添加 "type": "module" 到 package.json',
      });
    }

    // L012: 检查依赖
    const deps = { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) };
    const hasLLMSDK = deps["@anthropic/sdk"] || deps["@baize-loop/sdk"] || deps["openai"] || deps["@modelcontextprotocol/sdk"];
    if (!hasLLMSDK) {
      issues.push({
        code: "L012",
        severity: "warning",
        message: "package.json 缺少 LLM SDK 依赖（@anthropic/sdk 或 @baize-loop/sdk）",
        file: packageJsonPath,
        suggestion: "添加 LLM SDK 依赖",
      });
    }
  }

  // L013: main.ts 基本检查
  const mainTsPath = path.join(agentDir, "main.ts");
  if (fs.existsSync(mainTsPath)) {
    const content = fs.readFileSync(mainTsPath, "utf-8");
    if (!content.includes("run(") && !content.includes("main(")) {
      issues.push({
        code: "L013",
        severity: "warning",
        message: "main.ts 未找到入口函数",
        file: mainTsPath,
      });
    }
  }

  return issues;
}

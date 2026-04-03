/**
 * StructuralReviewer — 目录结构与必需文件评审
 * 权重: 15%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewStructural(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];

  const has = (rel: string) => fs.existsSync(path.join(agentDir, rel));
  const hasFile = (rel: string, content?: string) => {
    const p = path.join(agentDir, rel);
    if (!fs.existsSync(p)) return false;
    if (content !== undefined) {
      const c = fs.readFileSync(p, "utf-8");
      return c.includes(content);
    }
    return true;
  };

  // 必需文件检查
  let score = 10;

  // main.ts
  if (!has("main.ts")) {
    issues.push({ code: "R001", severity: "error", dimension: "structural", description: "缺少 main.ts 入口文件", location: path.join(agentDir, "main.ts"), suggestion: "创建 main.ts 作为 Agent 运行时入口" });
    score -= 2;
  } else {
    highlights.push("✅ main.ts 入口文件存在");
  }

  // prompts/system.md
  if (!has("prompts/system.md")) {
    issues.push({ code: "R002", severity: "error", dimension: "structural", description: "缺少 prompts/system.md 角色定义", location: path.join(agentDir, "prompts/system.md"), suggestion: "创建 prompts/system.md 定义 Agent 角色" });
    score -= 2;
  } else {
    highlights.push("✅ prompts/system.md 存在");
  }

  // prompts/safety.md
  if (!has("prompts/safety.md")) {
    issues.push({ code: "R003", severity: "warning", dimension: "structural", description: "缺少 prompts/safety.md 安全红线文件", location: path.join(agentDir, "prompts/safety.md"), suggestion: "创建 prompts/safety.md 定义安全约束" });
    score -= 1;
  }

  // src/ 目录
  if (!has("src/")) {
    issues.push({ code: "R004", severity: "warning", dimension: "structural", description: "缺少 src/ 目录", location: path.join(agentDir, "src"), suggestion: "创建 src/ 目录包含 types.ts, loop.ts, provider.ts" });
    score -= 1;
  } else {
    // 检查 src 文件
    const srcFiles = ["types.ts", "loop.ts", "provider.ts"].filter(f => !has(`src/${f}`));
    if (srcFiles.length > 0) {
      for (const f of srcFiles) {
        issues.push({ code: "R005", severity: "info", dimension: "structural", description: `src/ 目录缺少 ${f}`, location: path.join(agentDir, `src/${f}`), suggestion: `创建 src/${f}` });
      }
      score -= 0.5;
    }
  }

  // package.json
  if (!has("package.json")) {
    issues.push({ code: "R006", severity: "warning", dimension: "structural", description: "缺少 package.json", location: path.join(agentDir, "package.json"), suggestion: "创建 package.json 包含必要依赖" });
    score -= 0.5;
  }

  // skills/ 目录（推荐）
  if (!has("skills/")) {
    issues.push({ code: "R007", severity: "info", dimension: "structural", description: "缺少 skills/ 目录（推荐但非必需）", location: path.join(agentDir, "skills"), suggestion: "创建 skills/ 目录提供原子化能力集" });
    score -= 0;
  } else {
    highlights.push("✅ skills/ 目录存在");
  }

  // AGENT.md 或 agent.yaml（推荐）
  if (!has("AGENT.md") && !has("agent.yaml")) {
    issues.push({ code: "R008", severity: "warning", dimension: "structural", description: "缺少 AGENT.md 或 agent.yaml 元数据文件", location: agentDir, suggestion: "创建 AGENT.md 作为 Agent 元数据定义" });
    score -= 0.5;
  } else if (has("AGENT.md")) {
    highlights.push("✅ AGENT.md 元数据存在");
  }

  // tsconfig.json（TypeScript 项目）
  if (!has("tsconfig.json") && has("main.ts")) {
    issues.push({ code: "R009", severity: "info", dimension: "structural", description: "缺少 tsconfig.json", location: path.join(agentDir, "tsconfig.json"), suggestion: "创建 tsconfig.json 配置 TypeScript 编译" });
    score -= 0;
  }

  return {
    dimension: "structural",
    score: Math.max(0, score),
    weight: 15,
    issues,
    highlights,
  };
}

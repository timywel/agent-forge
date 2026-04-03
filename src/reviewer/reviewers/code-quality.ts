/**
 * CodeQualityReviewer — TypeScript 代码质量评审
 * 权重: 10%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewCodeQuality(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  const srcDir = path.join(agentDir, "src");
  const skillsDir = path.join(agentDir, "skills");

  const tsFiles: string[] = [];
  if (fs.existsSync(srcDir)) {
    try {
      tsFiles.push(...fs.readdirSync(srcDir).filter(f => f.endsWith(".ts")));
    } catch {}
  }
  if (fs.existsSync(skillsDir)) {
    try {
      tsFiles.push(...fs.readdirSync(skillsDir).filter(f => f.endsWith(".ts") && f !== "index.ts"));
    } catch {}
  }

  if (tsFiles.length === 0) {
    issues.push({ code: "R040", severity: "info", dimension: "codeQuality", description: "无 TypeScript 文件，跳过代码质量评审", location: agentDir });
    return { dimension: "codeQuality", score: 10, weight: 10, issues, highlights };
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let emptyFiles = 0;

  for (const tf of tsFiles) {
    const filePath = path.join(srcDir, tf);
    const content = fs.readFileSync(filePath, "utf-8");

    if (content.trim().length < 50) {
      emptyFiles++;
      issues.push({ code: "R041", severity: "info", dimension: "codeQuality", description: `文件 ${tf} 内容过短（<50 字符）`, location: filePath });
      score -= 0.2;
      continue;
    }

    // 检查 try-catch 错误处理
    const hasTryCatch = content.includes("try {") || content.includes("try{");
    const hasAsync = content.includes("async") || content.includes("Promise");
    if (hasAsync && !hasTryCatch) {
      issues.push({ code: "R042", severity: "warning", dimension: "codeQuality", description: `文件 ${tf} 包含异步代码但缺少 try-catch`, location: filePath, suggestion: "为异步代码添加错误处理" });
      totalWarnings++;
    }

    // 检查 console.log（生产代码中应避免或用日志替代）
    const consoleCount = (content.match(/console\.(log|debug|info|warn|error)/g) ?? []).length;
    if (consoleCount > 5) {
      issues.push({ code: "R043", severity: "info", dimension: "codeQuality", description: `文件 ${tf} 包含 ${consoleCount} 个 console 调用`, location: filePath, suggestion: "考虑使用结构化日志替代 console" });
      totalWarnings++;
    }

    // 检查 TODO/FIXME（未完成代码标记）
    const todoCount = (content.match(/\b(TODO|FIXME|HACK|XXX)\b/gi) ?? []).length;
    if (todoCount > 0) {
      issues.push({ code: "R044", severity: "info", dimension: "codeQuality", description: `文件 ${tf} 包含 ${todoCount} 个 TODO/FIXME`, location: filePath, suggestion: "完成未完成代码或移除 TODO 标记" });
      totalWarnings++;
    }

    // 检查是否有意义的导出（支持 async 函数）
    const hasExport = /export\s+(async\s+)?(const|function|class|type|interface)/.test(content);
    if (!hasExport) {
      issues.push({ code: "R045", severity: "info", dimension: "codeQuality", description: `文件 ${tf} 无有效导出`, location: filePath });
      totalWarnings++;
    }

    // 检查长函数（>100 行）
    const lines = content.split("\n");
    if (lines.length > 100) {
      issues.push({ code: "R046", severity: "info", dimension: "codeQuality", description: `文件 ${tf} 过长（${lines.length} 行），建议拆分`, location: filePath, suggestion: "将长文件拆分为多个模块" });
      totalWarnings++;
    }
  }

  if (totalErrors > 0) score -= 2;
  else if (totalWarnings > 5) score -= 1;
  else if (totalWarnings > 0) score -= 0.5;

  if (tsFiles.length > 0) {
    highlights.push(`✅ ${tsFiles.length} 个 TypeScript 文件`);
  }

  return {
    dimension: "codeQuality",
    score: Math.max(0, score),
    weight: 10,
    issues,
    highlights,
  };
}

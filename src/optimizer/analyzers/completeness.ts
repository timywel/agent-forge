/**
 * LIAS Completeness 质量分析器
 * 评估目录完整性（main.ts, package.json）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";

export function analyzeCompleteness(agentDir: string): { score: number; improvements: Improvement[] } {
  const improvements: Improvement[] = [];
  let score = 100;

  const required = [
    { path: "main.ts", code: "C001", msg: "缺少 main.ts" },
    { path: "package.json", code: "C002", msg: "缺少 package.json" },
    { path: "prompts/system.md", code: "C003", msg: "缺少 prompts/system.md" },
    { path: "prompts/safety.md", code: "C004", msg: "缺少 prompts/safety.md" },
    { path: "src/types.ts", code: "C005", msg: "缺少 src/types.ts" },
    { path: "src/loop.ts", code: "C006", msg: "缺少 src/loop.ts" },
    { path: "src/provider.ts", code: "C007", msg: "缺少 src/provider.ts" },
  ];

  for (const item of required) {
    const itemPath = path.join(agentDir, item.path);
    if (!fs.existsSync(itemPath)) {
      score -= 15;
      improvements.push({ id: item.code, category: "structure", description: item.msg, severity: "error", autoFixable: false, applied: false, file: itemPath });
    }
  }

  // package.json type: module 检查
  const pkgPath = path.join(agentDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.type !== "module") {
        score -= 10;
        improvements.push({ id: "C010", category: "structure", description: 'package.json 缺少 "type": "module"', severity: "error", autoFixable: true, applied: false, file: pkgPath });
      }
    } catch {}
  }

  return { score: Math.max(0, score), improvements };
}

/**
 * LIAS Runtime 质量分析器
 * 评估 loop.ts / provider.ts / types.ts 的可执行性
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";

export function analyzeRuntime(agentDir: string): { score: number; improvements: Improvement[] } {
  const improvements: Improvement[] = [];
  let score = 100;

  const srcDir = path.join(agentDir, "src");
  if (!fs.existsSync(srcDir)) {
    return { score: 0, improvements: [{ id: "R001", category: "runtime", description: "缺少 src/ 目录", severity: "error", autoFixable: false, applied: false }] };
  }

  // loop.ts 检查
  const loopPath = path.join(srcDir, "loop.ts");
  if (!fs.existsSync(loopPath)) {
    score -= 40;
    improvements.push({ id: "R002", category: "runtime", description: "缺少 src/loop.ts", severity: "error", autoFixable: false, applied: false });
  } else {
    const loopContent = fs.readFileSync(loopPath, "utf-8");
    if (!loopContent.includes("allTools")) score -= 15;
    if (!loopContent.includes("loadPrompts")) score -= 10;
    if (!loopContent.includes("run(") && !loopContent.includes("loop(")) score -= 10;
  }

  // provider.ts 检查
  const providerPath = path.join(srcDir, "provider.ts");
  if (!fs.existsSync(providerPath)) {
    score -= 30;
    improvements.push({ id: "R003", category: "runtime", description: "缺少 src/provider.ts", severity: "error", autoFixable: false, applied: false });
  } else {
    const providerContent = fs.readFileSync(providerPath, "utf-8");
    if (!providerContent.includes("llm") && !providerContent.includes("createClient")) {
      score -= 10;
      improvements.push({ id: "R004", category: "runtime", description: "provider.ts 应导出 llm 客户端", severity: "warning", autoFixable: true, applied: false, file: providerPath });
    }
  }

  // types.ts 检查
  const typesPath = path.join(srcDir, "types.ts");
  if (!fs.existsSync(typesPath)) {
    score -= 20;
    improvements.push({ id: "R005", category: "runtime", description: "缺少 src/types.ts", severity: "error", autoFixable: false, applied: false });
  } else {
    const typesContent = fs.readFileSync(typesPath, "utf-8");
    if (!typesContent.includes("loadPrompts")) {
      score -= 5;
      improvements.push({ id: "R006", category: "runtime", description: "types.ts 应包含 loadPrompts 辅助函数", severity: "info", autoFixable: true, applied: false, file: typesPath });
    }
  }

  return { score: Math.max(0, score), improvements };
}

/**
 * LIAS Optimizer — 优化器主入口
 * 分析 Agent 质量并自动/半自动优化
 */

import * as path from "node:path";
import type { OptimizationResult, QualityScore, Improvement, ForgeConfig } from "../types/index.js";
import type { ILLMClient } from "../llm/client.js";
import { createLLMClient } from "../llm/client.js";

import { analyzeIdentity } from "./analyzers/identity.js";
import { analyzeSkills } from "./analyzers/skill.js";
import { analyzeSafety } from "./analyzers/safety.js";
import { analyzeRuntime } from "./analyzers/runtime.js";
import { analyzeCompleteness } from "./analyzers/completeness.js";

import { enhanceIdentity } from "./enhancers/identity.js";
import { enhanceSafety } from "./enhancers/safety.js";
import { enhanceSkills } from "./enhancers/skill.js";

export interface OptimizeOptions {
  agentDir: string;
  autoFix?: boolean;
  useLLM?: boolean;
  config: ForgeConfig;
}

export function analyze(agentDir: string): { score: QualityScore; improvements: Improvement[] } {
  const resolved = path.resolve(agentDir);

  const identityResult = analyzeIdentity(resolved);
  const skillsResult = analyzeSkills(resolved);
  const safetyResult = analyzeSafety(resolved);
  const runtimeResult = analyzeRuntime(resolved);
  const completenessResult = analyzeCompleteness(resolved);

  const allImprovements = [
    ...identityResult.improvements,
    ...skillsResult.improvements,
    ...safetyResult.improvements,
    ...runtimeResult.improvements,
    ...completenessResult.improvements,
  ];

  // LIAS 权重：Identity 25%, Skills 30%, Safety 20%, Runtime 15%, Consistency 10%
  const overall = Math.round(
    identityResult.score * 0.25 +
    skillsResult.score * 0.30 +
    safetyResult.score * 0.20 +
    runtimeResult.score * 0.15 +
    completenessResult.score * 0.10
  );

  return {
    score: {
      overall,
      identity: identityResult.score,
      skills: skillsResult.score,
      safety: safetyResult.score,
      runtime: runtimeResult.score,
      completeness: completenessResult.score,
      details: {
        identity: identityResult.score,
        skills: skillsResult.score,
        safety: safetyResult.score,
        runtime: runtimeResult.score,
        completeness: completenessResult.score,
      },
    },
    improvements: allImprovements,
  };
}

export async function optimize(options: OptimizeOptions): Promise<OptimizationResult> {
  const resolved = path.resolve(options.agentDir);
  const { autoFix = true, useLLM = false, config } = options;

  const analysis = analyze(resolved);
  const allImprovements = [...analysis.improvements];

  let appliedCount = 0;
  let skippedCount = 0;

  if (autoFix || useLLM) {
    let llmClient: ILLMClient | undefined;
    if (useLLM) {
      llmClient = createLLMClient(config.llm);
    }

    const skillFixes = await enhanceSkills(resolved, llmClient);
    allImprovements.push(...skillFixes);

    if (useLLM && llmClient) {
      const identityFixes = await enhanceIdentity(resolved, llmClient);
      allImprovements.push(...identityFixes);

      const safetyFixes = await enhanceSafety(resolved, llmClient);
      allImprovements.push(...safetyFixes);
    }
  }

  for (const imp of allImprovements) {
    if (imp.applied) appliedCount++;
    else skippedCount++;
  }

  const postAnalysis = analyze(resolved);

  return {
    success: true,
    agentDir: resolved,
    score: postAnalysis.score,
    improvements: allImprovements,
    appliedCount,
    skippedCount,
  };
}

export function formatOptimizeReport(result: OptimizationResult): string {
  const lines: string[] = [];

  lines.push(`📊 Agent 质量报告: ${path.basename(result.agentDir)}`);
  lines.push("");
  lines.push(`总评分: ${result.score.overall}/100`);
  lines.push("");
  lines.push("维度评分:");
  lines.push(`  身份定义 (Identity): ${result.score.identity}/100`);
  lines.push(`  Skill 质量 (Skills): ${result.score.skills}/100`);
  lines.push(`  安全红线 (Safety): ${result.score.safety}/100`);
  lines.push(`  运行时 (Runtime): ${result.score.runtime}/100`);
  lines.push(`  完整性 (Completeness): ${result.score.completeness}/100`);
  lines.push("");

  if (result.improvements.length > 0) {
    lines.push("改进建议:");
    const grouped: Record<string, Improvement[]> = {};
    for (const item of result.improvements) {
      (grouped[item.category] ??= []).push(item);
    }
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`  [${cat}]`);
      for (const item of items) {
        const icon = item.applied ? "✅" : item.severity === "error" ? "❌" : item.severity === "warning" ? "⚠️" : "ℹ️";
        const status = item.applied ? "(已修复)" : item.autoFixable ? "(可自动修复)" : "";
        lines.push(`    ${icon} ${item.description} ${status}`);
      }
    }
    lines.push("");
  }

  lines.push(`已应用: ${result.appliedCount} | 待处理: ${result.skippedCount}`);

  return lines.join("\n");
}

/**
 * ReviewBoard — Agent 评审管理 Agent
 * 并行调度 9 个专业 Reviewer，聚合评分，输出报告
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentReviewResult,
  ReviewConfig,
  ReviewReport,
  ReviewIssue,
} from "../types/review.js";
import { DIMENSION_WEIGHTS } from "../types/review.js";
import { reviewStructural } from "./reviewers/structural.js";
import { reviewIdentity } from "./reviewers/identity.js";
import { reviewSafety } from "./reviewers/safety.js";
import { reviewSkillSpec } from "./reviewers/skill-spec.js";
import { reviewCodeQuality } from "./reviewers/code-quality.js";
import { reviewDomainFitness } from "./reviewers/domain-fitness.js";
import { reviewDescAccuracy } from "./reviewers/desc-accuracy.js";
import { reviewDuplication } from "./reviewers/duplication.js";
import { reviewNaming } from "./reviewers/naming.js";
import { generateMarkdownReport } from "./reporters/markdown.js";
import { generateJsonReport } from "./reporters/json.js";

export interface ReviewBoardOptions {
  config?: ReviewConfig;
  verbose?: boolean;
}

export async function runReviewBoard(agentDirs: string[], options: ReviewBoardOptions = {}): Promise<ReviewReport> {
  const { verbose = false } = options;
  const config: ReviewConfig = options.config ?? {};

  if (verbose) {
    console.log(`🔍 评审团启动: ${agentDirs.length} 个 Agent`);
    console.log("");
  }

  const results: AgentReviewResult[] = [];

  // 并行评审所有 Agent
  const reviewPromises = agentDirs.map(async (agentDir) => {
    if (verbose) {
      console.log(`  评审: ${path.basename(agentDir)}...`);
    }
    const result = await reviewAgent(agentDir, verbose);
    if (verbose) {
      console.log(`评分 ${result.overallScore.toFixed(1)}`);
    }
    return result;
  });

  const allResults = await Promise.all(reviewPromises);
  results.push(...allResults);

  if (verbose) {
    console.log("");
  }

  // 生成汇总报告
  const report = buildReport(results, config);
  return report;
}

async function reviewAgent(agentDir: string, verbose = false): Promise<AgentReviewResult> {
  // 并行执行所有评审器
  const [
    structural,
    identity,
    safety,
    skillSpec,
    codeQuality,
    domainFitness,
    descAccuracy,
    duplication,
    naming,
  ] = await Promise.all([
    Promise.resolve(reviewStructural(agentDir)),
    Promise.resolve(reviewIdentity(agentDir)),
    Promise.resolve(reviewSafety(agentDir)),
    Promise.resolve(reviewSkillSpec(agentDir)),
    Promise.resolve(reviewCodeQuality(agentDir)),
    Promise.resolve(reviewDomainFitness(agentDir)),
    Promise.resolve(reviewDescAccuracy(agentDir)),
    Promise.resolve(reviewDuplication(agentDir)),
    Promise.resolve(reviewNaming(agentDir)),
  ]);

  const dimensions = [structural, identity, safety, skillSpec, codeQuality, domainFitness, descAccuracy, duplication, naming];

  // 计算加权总分（10 分制）
  let overallScore = 0;
  for (const dim of dimensions) {
    overallScore += (dim.score / 10) * dim.weight;
  }
  overallScore = Math.round(overallScore * 10) / 10;

  // 计算百分制
  const weightedScore = Math.round(overallScore * 10);

  // 汇总所有 issues
  const allIssues: ReviewIssue[] = [];
  const recommendations: string[] = [];
  const highlights: string[] = [];
  for (const dim of dimensions) {
    allIssues.push(...dim.issues);
    highlights.push(...dim.highlights);
  }

  // 去重 issues
  const seenIssueKeys = new Set<string>();
  const uniqueIssues: ReviewIssue[] = [];
  for (const issue of allIssues) {
    const key = `${issue.code}:${issue.description}`;
    if (!seenIssueKeys.has(key)) {
      seenIssueKeys.add(key);
      uniqueIssues.push(issue);
    }
  }

  // 生成优先级
  for (const issue of uniqueIssues) {
    if (issue.severity === "error") {
      issue.priority = "P0";
    } else if (issue.severity === "warning") {
      issue.priority = "P1";
    } else {
      issue.priority = "P2";
    }
  }

  // 生成推荐建议
  const errorCount = uniqueIssues.filter(i => i.severity === "error").length;
  const warningCount = uniqueIssues.filter(i => i.severity === "warning").length;
  if (errorCount > 0) {
    recommendations.push(`修复 ${errorCount} 个错误级别问题（P0）`);
  }
  if (warningCount > 0) {
    recommendations.push(`优化 ${warningCount} 个警告级别问题（P1）`);
  }
  if (uniqueIssues.length === 0) {
    recommendations.push("Agent 质量良好，继续保持");
  }

  const agentId = path.basename(agentDir);

  return {
    agentId,
    agentPath: agentDir,
    overallScore,
    weightedScore,
    dimensions,
    issues: uniqueIssues,
    recommendations,
    highlights,
  };
}

function buildReport(results: AgentReviewResult[], config: ReviewConfig): ReviewReport {
  const topN = config.includeTopN ?? 5;
  const bottomN = config.includeBottomN ?? 10;

  // 按评分排序
  const sorted = [...results].sort((a, b) => a.overallScore - b.overallScore);
  const bottomAgents = sorted.slice(0, bottomN);
  const topAgents = [...results].sort((a, b) => b.overallScore - a.overallScore).slice(0, topN);

  // 统计
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const errors = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === "error").length, 0);
  const warnings = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === "warning").length, 0);
  const infos = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === "info").length, 0);

  // 各维度平均分
  const dimensionKeys = Object.keys(DIMENSION_WEIGHTS) as Array<keyof typeof DIMENSION_WEIGHTS>;
  const byDimension: ReviewReport["summary"]["byDimension"] = {} as ReviewReport["summary"]["byDimension"];
  for (const dk of dimensionKeys) {
    const dimResults = results.map(r => r.dimensions.find(d => d.dimension === dk)).filter(Boolean);
    const avgScore = dimResults.length > 0
      ? dimResults.reduce((sum, d) => sum + (d?.score ?? 0), 0) / dimResults.length
      : 0;
    const totalDimIssues = results.reduce((sum, r) => sum + r.issues.filter(i => i.dimension === dk).length, 0);
    byDimension[dk] = { avgScore: Math.round(avgScore * 10) / 10, totalIssues: totalDimIssues };
  }

  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    : 0;
  const avgWeighted = results.length > 0
    ? results.reduce((sum, r) => sum + r.weightedScore, 0) / results.length
    : 0;

  return {
    version: "1.0",
    generated: new Date().toISOString().split("T")[0],
    totalAgents: results.length,
    summary: {
      avgScore: Math.round(avgScore * 10) / 10,
      avgWeightedScore: Math.round(avgWeighted),
      totalIssues,
      errors,
      warnings,
      infos,
      byDimension,
    },
    topAgents,
    bottomAgents,
    allAgents: results,
  };
}

export async function saveReport(report: ReviewReport, outputDir: string): Promise<void> {
  const dir = outputDir || path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });

  const date = report.generated;
  const mdPath = path.join(dir, `agent-review-report-${date}.md`);
  const jsonPath = path.join(dir, `agent-review-report-${date}.json`);

  fs.writeFileSync(mdPath, generateMarkdownReport(report), "utf-8");
  fs.writeFileSync(jsonPath, generateJsonReport(report), "utf-8");

  console.log(`📄 Markdown 报告: ${mdPath}`);
  console.log(`📊 JSON 报告: ${jsonPath}`);
}

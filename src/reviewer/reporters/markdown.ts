/**
 * Markdown 报告生成器
 */

import type { ReviewReport, AgentReviewResult, DimensionScore } from "../../types/review.js";
import { DIMENSION_WEIGHTS } from "../../types/review.js";

export function generateMarkdownReport(report: ReviewReport): string {
  const lines: string[] = [];

  // 标题
  lines.push(`# Agent 评审报告`);
  lines.push(``);
  lines.push(`**生成日期**: ${report.generated}`);
  lines.push(`**版本**: ${report.version}`);
  lines.push(``);
  lines.push(`---\n`);

  // 汇总
  lines.push(`## 评分总览`);
  lines.push(``);
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|---|---|`);
  lines.push(`| Agent 总数 | ${report.totalAgents} |`);
  lines.push(`| 平均评分 | ${report.summary.avgScore}/10 |`);
  lines.push(`| 百分制均分 | ${report.summary.avgWeightedScore}/100 |`);
  lines.push(`| 问题总数 | ${report.summary.totalIssues} |`);
  lines.push(`| 错误 (P0) | ${report.summary.errors} |`);
  lines.push(`| 警告 (P1) | ${report.summary.warnings} |`);
  lines.push(`| 提示 (P2) | ${report.summary.infos} |`);
  lines.push(``);

  // 各维度评分
  lines.push(`## 各维度评分`);
  lines.push(``);
  lines.push(`| 维度 | 权重 | 平均分 | 问题数 |`);
  lines.push(`|---|---|---|---|`);
  for (const [dim, data] of Object.entries(report.summary.byDimension)) {
    const weight = DIMENSION_WEIGHTS[dim as keyof typeof DIMENSION_WEIGHTS];
    const barScore = Math.max(0, Math.min(10, Math.round(data.avgScore)));
    const bar = "▓".repeat(barScore) + "░".repeat(10 - barScore);
    lines.push(`| ${dimLabel(dim)} | ${weight}% | ${bar} ${data.avgScore}/10 | ${data.totalIssues} |`);
  }
  lines.push(``);

  // 问题分布（按维度）
  const dimIssueCounts = new Map<string, number>();
  for (const agent of report.allAgents) {
    for (const issue of agent.issues) {
      dimIssueCounts.set(issue.dimension, (dimIssueCounts.get(issue.dimension) ?? 0) + 1);
    }
  }
  if (dimIssueCounts.size > 0) {
    lines.push(`## 问题分布（按维度）`);
    lines.push(``);
    lines.push(`| 维度 | 问题数 |`);
    lines.push(`|---|---|`);
    const sortedDims = [...dimIssueCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [dim, count] of sortedDims) {
      lines.push(`| ${dimLabel(dim)} | ${count} |`);
    }
    lines.push(``);
  }

  // Top 5 优质 Agent
  if (report.topAgents.length > 0) {
    lines.push(`## Top ${report.topAgents.length} 优质 Agent`);
    lines.push(``);
    for (const agent of report.topAgents) {
      lines.push(...formatAgentSummary(agent));
      lines.push(``);
    }
  }

  // Bottom 10 问题 Agent
  if (report.bottomAgents.length > 0) {
    lines.push(`## Bottom ${report.bottomAgents.length} 问题 Agent（需优先优化）`);
    lines.push(``);
    for (const agent of report.bottomAgents) {
      lines.push(...formatAgentDetail(agent));
      lines.push(`---\n`);
    }
  }

  // 全局问题统计
  const globalIssues = aggregateGlobalIssues(report.allAgents);
  if (globalIssues.length > 0) {
    lines.push(`## 全局问题统计`);
    lines.push(``);
    lines.push(`| 问题代码 | 描述 | 出现次数 | 严重性 | 优先级 |`);
    lines.push(`|---|---|---|---|---|`);
    for (const gi of globalIssues) {
      lines.push(`| ${gi.code} | ${gi.description} | ${gi.count} | ${gi.severity} | ${gi.priority} |`);
    }
    lines.push(``);
  }

  // 优化建议清单
  lines.push(`## 优化建议清单`);
  lines.push(``);
  const allRecommendations = new Map<string, number>();
  for (const agent of report.bottomAgents) {
    for (const rec of agent.recommendations) {
      allRecommendations.set(rec, (allRecommendations.get(rec) ?? 0) + 1);
    }
  }
  for (const [rec, count] of [...allRecommendations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    lines.push(`- ${rec}（涉及 ${count} 个 Agent）`);
  }
  lines.push(``);

  return lines.join("\n");
}

function formatAgentSummary(agent: AgentReviewResult): string[] {
  const lines: string[] = [];
  const barScore = Math.max(0, Math.min(10, Math.round(agent.overallScore)));
  const bar = "▓".repeat(barScore) + "░".repeat(10 - barScore);
  lines.push(`### ${agent.agentId}（${bar} ${agent.overallScore}/10, ${agent.weightedScore}/100）`);
  lines.push(``);
  lines.push(`**路径**: \`${agent.agentPath}\``);
  lines.push(``);
  lines.push(`| 维度 | 评分 |`);
  lines.push(`|---|---|`);
  for (const dim of agent.dimensions) {
    const dBarScore = Math.max(0, Math.min(10, Math.round(dim.score)));
    const dBar = "▓".repeat(dBarScore) + "░".repeat(10 - dBarScore);
    lines.push(`| ${dimLabel(dim.dimension)} | ${dBar} ${dim.score}/10 |`);
  }
  lines.push(``);
  if (agent.highlights.length > 0) {
    for (const h of agent.highlights.slice(0, 3)) {
      lines.push(`- ${h}`);
    }
    lines.push(``);
  }
  return lines;
}

function formatAgentDetail(agent: AgentReviewResult): string[] {
  const lines: string[] = [];
  const barScore = Math.max(0, Math.min(10, Math.round(agent.overallScore)));
  const bar = "▓".repeat(barScore) + "░".repeat(10 - barScore);
  lines.push(`### ${agent.agentId}（${bar} ${agent.overallScore}/10, ${agent.weightedScore}/100）⚠️`);
  lines.push(``);
  lines.push(`**路径**: \`${agent.agentPath}\``);
  lines.push(``);

  const errors = agent.issues.filter(i => i.severity === "error");
  const warnings = agent.issues.filter(i => i.severity === "warning");
  const infos = agent.issues.filter(i => i.severity === "info");

  if (errors.length > 0) {
    lines.push(`**P0 错误（${errors.length} 个）**:`);
    for (const issue of errors.slice(0, 5)) {
      lines.push(`  - ${issue.code}: ${issue.description}`);
      if (issue.suggestion) lines.push(`    > ${issue.suggestion}`);
    }
    lines.push(``);
  }
  if (warnings.length > 0) {
    lines.push(`**P1 警告（${warnings.length} 个）**:`);
    for (const issue of warnings.slice(0, 5)) {
      lines.push(`  - ${issue.code}: ${issue.description}`);
    }
    lines.push(``);
  }
  if (infos.length > 0) {
    lines.push(`**P2 提示（${infos.length} 个）**:`);
    for (const issue of infos.slice(0, 3)) {
      lines.push(`  - ${issue.code}: ${issue.description}`);
    }
    lines.push(``);
  }

  lines.push(`**推荐优化**: ${agent.recommendations.join("; ")}`);
  lines.push(``);
  return lines;
}

function aggregateGlobalIssues(agents: AgentReviewResult[]): Array<{ code: string; description: string; count: number; severity: string; priority: string }> {
  const issueMap = new Map<string, { code: string; description: string; count: number; severity: string; priority: string }>();
  for (const agent of agents) {
    for (const issue of agent.issues) {
      const key = `${issue.code}:${issue.description}`;
      const existing = issueMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        issueMap.set(key, {
          code: issue.code,
          description: issue.description.length > 60 ? issue.description.slice(0, 57) + "..." : issue.description,
          count: 1,
          severity: issue.severity,
          priority: issue.priority ?? "P2",
        });
      }
    }
  }
  return [...issueMap.values()].sort((a, b) => b.count - a.count);
}

function dimLabel(dim: string): string {
  const labels: Record<string, string> = {
    structural: "结构合规",
    identity: "身份定义",
    safety: "安全规范",
    skillSpec: "SKILL.md",
    codeQuality: "代码质量",
    domainFitness: "领域适配",
    descAccuracy: "描述准确性",
    duplication: "重复冗余",
    naming: "命名一致性",
  };
  return labels[dim] ?? dim;
}

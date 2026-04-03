/**
 * JSON 报告生成器
 * 输出可被 batch-optimize.ts 直接消费的结构化数据
 */

import type { ReviewReport } from "../../types/review.js";

export function generateJsonReport(report: ReviewReport): string {
  const json = {
    version: report.version,
    generated: report.generated,
    totalAgents: report.totalAgents,
    summary: report.summary,
    topAgents: report.topAgents.map(formatAgent),
    bottomAgents: report.bottomAgents.map(formatAgent),
    allAgents: report.allAgents.map(formatAgent),
  };
  return JSON.stringify(json, null, 2);
}

function formatAgent(agent: import("../../types/review.js").AgentReviewResult) {
  return {
    id: agent.agentId,
    path: agent.agentPath,
    overallScore: agent.overallScore,
    weightedScore: agent.weightedScore,
    dimensions: agent.dimensions.map(d => ({
      dimension: d.dimension,
      score: d.score,
      weight: d.weight,
      issueCount: d.issues.length,
    })),
    issues: agent.issues.map(i => ({
      code: i.code,
      severity: i.severity,
      dimension: i.dimension,
      description: i.description,
      location: i.location,
      suggestion: i.suggestion,
      priority: i.priority,
    })),
    recommendations: agent.recommendations,
    highlights: agent.highlights,
  };
}

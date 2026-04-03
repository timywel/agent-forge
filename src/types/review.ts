/**
 * Agent 评审结果类型定义
 */

export type DimensionKey =
  | "structural"
  | "identity"
  | "safety"
  | "skillSpec"
  | "codeQuality"
  | "domainFitness"
  | "descAccuracy"
  | "duplication"
  | "naming";

export interface DimensionScore {
  dimension: DimensionKey;
  score: number;       // 0-10
  weight: number;      // 权重百分比
  issues: ReviewIssue[];
  highlights: string[]; // 亮点
}

export interface ReviewIssue {
  code: string;         // 如 "R001"
  severity: "error" | "warning" | "info";
  dimension: DimensionKey;
  description: string;
  location?: string;    // 文件路径
  suggestion?: string;
  priority?: "P0" | "P1" | "P2";
}

export interface AgentReviewResult {
  agentId: string;
  agentPath: string;
  overallScore: number;       // 加权总分 0-10
  weightedScore: number;      // 百分制
  dimensions: DimensionScore[];
  issues: ReviewIssue[];
  recommendations: string[];  // 优化建议
  highlights: string[];      // 亮点总结
}

export interface ReviewReport {
  version: string;
  generated: string;         // ISO date
  totalAgents: number;
  summary: {
    avgScore: number;
    avgWeightedScore: number;
    totalIssues: number;
    errors: number;
    warnings: number;
    infos: number;
    byDimension: Record<DimensionKey, { avgScore: number; totalIssues: number }>;
  };
  topAgents: AgentReviewResult[];    // Top 5
  bottomAgents: AgentReviewResult[];  // Bottom 10
  allAgents: AgentReviewResult[];
}

export interface ReviewConfig {
  llm?: {
    baseUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
    apiKey?: string;
  };
  includeBottomN?: number;  // 默认 10
  includeTopN?: number;      // 默认 5
  outputDir?: string;
}

// 维度权重映射
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  structural: 15,
  identity: 20,
  safety: 10,
  skillSpec: 15,
  codeQuality: 10,
  domainFitness: 10,
  descAccuracy: 10,
  duplication: 5,
  naming: 5,
};

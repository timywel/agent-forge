/**
 * agent-forge 公共类型定义
 */

// ── 验证级别 ──
export type Severity = "error" | "warning" | "info";

// ── 验证问题 ──
export interface ValidationIssue {
  code: string;          // 如 "V001"
  severity: Severity;
  message: string;
  path?: string;         // 指向具体字段，如 "metadata.id"
  file?: string;         // 相关文件路径
  suggestion?: string;   // 修复建议
}

// ── 验证结果 ──
export interface ValidationResult {
  passed: boolean;
  agentDir: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  summary: string;
}

// ── 转换结果 ──
export interface ConversionResult {
  success: boolean;
  outputDir: string;
  sourceFormat: SourceFormat;
  filesGenerated: string[];
  validation?: ValidationResult;
  errors?: string[];
}

// ── 优化结果 ──
export interface OptimizationResult {
  success: boolean;
  agentDir: string;
  score: QualityScore;
  improvements: Improvement[];
  appliedCount: number;
  skippedCount: number;
}

export interface QualityScore {
  overall: number;          // 0-100
  identity: number;         // Identity/Objective/SOP 完整性
  skills: number;           // SKILL.md 质量（Agent Skills 规范）+ TypeScript Skill 质量（LIAS 运行时）
  safety: number;           // safety.md 红线完整性
  runtime: number;           // loop.ts/provider.ts 可执行性
  completeness: number;      // 目录完整性
  details: Record<string, number>;
}

export interface Improvement {
  id: string;
  category: "identity" | "skill" | "safety" | "metadata" | "structure" | "consistency" | "runtime";
  description: string;
  severity: Severity;
  autoFixable: boolean;
  applied: boolean;
  before?: string;
  after?: string;
  file?: string;
}

// ── 源格式 ──
export type SourceFormat =
  | "lias"
  | "lias-minimal"
  | "bas"
  | "agent-md"
  | "agent-manifest"
  | "la"
  | "workflow"
  | "plugin"
  | "natural-lang"
  | "openapi"
  | "mcp"
  | "unknown";

// ── LLM 配置 ──
export interface LLMConfig {
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey?: string;
}

// ── Forge 全局配置 ──
export interface ForgeConfig {
  llm: LLMConfig;
  verbose: boolean;
  dryRun: boolean;
}

export const DEFAULT_FORGE_CONFIG: ForgeConfig = {
  llm: {
    baseUrl: "http://127.0.0.1:15721",
    model: "claude-sonnet-4-20250514",
    maxTokens: 8192,
    temperature: 0.3,
  },
  verbose: false,
  dryRun: false,
};

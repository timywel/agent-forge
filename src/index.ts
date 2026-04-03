/**
 * agent-forge 主入口
 * 导出 Validator / Converter / Optimizer 三大模块
 */

export { validate, formatReport } from "./validator/index.js";
export { convert, detectFormat, formatLabel } from "./converter/index.js";
export { analyze, optimize, formatOptimizeReport } from "./optimizer/index.js";
export { createLLMClient } from "./llm/client.js";

// 类型导出
export type {
  ValidationResult,
  ValidationIssue,
  ConversionResult,
  OptimizationResult,
  QualityScore,
  Improvement,
  SourceFormat,
  ForgeConfig,
  LLMConfig,
} from "./types/index.js";

export type { IntermediateRepresentation, IRSkill } from "./types/ir.js";
export type { AgentManifest, SkillManifest, SkillRegistry } from "./types/spec.js";
export type { ILLMClient, LLMMessage, LLMResponse } from "./llm/client.js";

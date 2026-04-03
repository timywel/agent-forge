/**
 * LIAS 类型导出
 */

export * from "./common.js";
// 注意：spec.ts 保留用于 agent.yaml 解析（向后兼容），不从此重新导出
export type { AgentManifest, AgentMetadata, SkillRegistry, SkillRegistryEntry, SkillManifest, ToolSchema } from "./spec.js";
export * from "./ir.js";

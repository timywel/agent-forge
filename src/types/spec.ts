/**
 * BAIZE-AGENT-SPEC v2 类型定义
 * 对应 agent.yaml 的完整 Schema
 */

// ── agent.yaml 完整类型 ──
export interface AgentManifest {
  apiVersion: "baize.io/v2";
  kind: "BaizeAgent";
  metadata: AgentMetadata;
  cognitive?: CognitiveModel;
  domains?: DomainConfig;
  skills?: SkillBinding;
  harness?: HarnessConfig;
  collaboration?: CollaborationConfig;
  lifecycle?: LifecycleConfig;
  metrics?: MetricsConfig;
}

export interface AgentMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  license?: string;
}

export interface CognitiveModel {
  role: "executor" | "advisor" | "orchestrator";
  personality?: string[];
  reasoning?: "analytical" | "creative" | "systematic";
}

export interface DomainConfig {
  primary: string;
  secondary?: string[];
}

export interface SkillBinding {
  required?: string[];
  optional?: string[];
  external?: ExternalSkillRef[];
}

export interface ExternalSkillRef {
  package: string;
  skills: string[];
}

export interface HarnessConfig {
  maxIterations?: number;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  streaming?: boolean;
}

export interface CollaborationConfig {
  handoffs_to?: HandoffTarget[];
  receives_from?: string[];
}

export interface HandoffTarget {
  agent: string;
  trigger: string;
}

export interface LifecycleConfig {
  status: "draft" | "staged" | "active" | "deprecated";
  created?: string;
  updated?: string;
}

export interface MetricsConfig {
  quality_dimensions?: string[];
  success_criteria?: string[];
}

// ── skill.yaml 类型 ──
export interface SkillManifest {
  name: string;
  version?: string;
  description: string;
  author?: string;
  tags?: string[];
  tool: ToolSchema;
  definition?: string;
  allowed_tools?: string[];
  parameters?: SkillParameter[];
  user_invocable?: boolean;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

export interface JSONSchema {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  default?: unknown;
}

export interface SkillParameter {
  name: string;
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

// ── _registry.yaml 类型 ──
export interface SkillRegistry {
  skills: SkillRegistryEntry[];
}

export interface SkillRegistryEntry {
  name: string;
  path: string;
  description: string;
  tags?: string[];
  executable: boolean;
}

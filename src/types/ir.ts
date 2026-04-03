/**
 * LIAS（Lightweight Industrial Agent Specification）类型定义
 * 所有输入格式先解析为 LIAS IR，再生成标准 LIAS Agent 项目
 *
 * 输出两种格式：
 * - skills: LIASSkill[]（TypeScript skill 文件，ReAct 循环内部工具）
 * - generatedSkills: GeneratedSkill[]（SKILL.md 文件，Claude Code 用户可调用）
 */

/**
 * LIAS Agent 的中间表示
 */
export interface LIASManifest {
  // ── 元数据 ──
  metadata: {
    id: string;
    name: string;
    version: string;
    description: string;
    author?: string;
    tags?: string[];
    sourceCategory?: string;
  };

  // ── 身份定义 ──
  identity: {
    role: string;
    objective: string;
    personality?: string;
    vibe?: string;
    capabilities: string[];
    style: string[];
    sop?: string[];              // 标准操作步骤
    outputFormat?: string;
  };

  // ── 安全约束 ──
  safety: {
    prohibited: string[];       // 绝对禁止的行为
    constraints: string[];       // 范围限定
    fallback: string[];          // 无法满足时的拒绝逻辑
  };

  // ── TypeScript Skill 列表（LIAS 运行时内部工具）──
  skills: LIASSkill[];

  // ── SKILL.md 格式列表（Claude Code 用户可调用，Agent Skills 规范）──
  generatedSkills?: import("../skill-generator/index.js").GeneratedSkill[];

  // ── SKILL.md 原始字段（用于生成 .claude/skills/*/SKILL.md，Agent Skills 规范）──
  skillSpecs?: Array<{
    /** kebab-case，1-64 字符，与父目录名一致 */
    name: string;
    /** 描述用途，1-1024 字符 */
    description: string;
    /** 环境依赖说明，≤500 字符 */
    compatibility?: string;
    /** 自定义键值映射 */
    metadata?: Record<string, string>;
    /** 空格分隔的预批准工具列表 */
    allowedTools?: string[];
    /** Markdown 指令正文 */
    instructions?: string;
  }>;

  // ── LLM Provider ──
  provider?: {
    type: "claude" | "openai" | "glm" | "baize-loop";
    model?: string;
    apiKeyEnvVar?: string;
  };

  // ── Harness 配置 ──
  harness?: {
    maxIterations?: number;
    maxTokens?: number;
    temperature?: number;
  };

  // ── 协作 ──
  collaboration?: {
    handoffsTo?: Array<{ agent: string; trigger: string }>;
    receivesFrom?: string[];
  };

  // ── 源格式信息 ──
  source: {
    type: "lias" | "lias-minimal" | "nl" | "bas" | "agent-md" | "agent-manifest" | "la" | "workflow" | "plugin" | "openapi" | "mcp" | "unknown";
    path: string;
    originalContent?: string;
  };
}

/**
 * LIAS Skill 定义
 * 每个 skill 生成一个独立的 TypeScript 文件
 */
export interface LIASSkill {
  name: string;                  // kebab-case, e.g. "fetch-data"
  toolName: string;              // snake_case, e.g. "fetch_data"
  description: string;
  inputSchema: JSONSchema;
  handler?: string;               // TypeScript handler code
  harness?: HarnessRule[];       // 运行时校验规则
  tags?: string[];
}

/**
 * JSON Schema（简化版，用于 Skill 输入）
 */
export interface JSONSchema {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

/**
 * Harness 运行时校验规则
 */
export interface HarnessRule {
  type: "range" | "length" | "pattern" | "required" | "custom";
  field: string;
  value?: unknown;
  message?: string;
}

/**
 * 向后兼容别名
 * @deprecated 使用 LIASManifest 代替
 */
export type IntermediateRepresentation = LIASManifest;

/**
 * 向后兼容别名
 * @deprecated 使用 LIASSkill 代替
 */
export type IRSkill = LIASSkill;

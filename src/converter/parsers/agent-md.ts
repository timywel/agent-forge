/**
 * .agent.md 格式解析器（Frontmatter + Markdown body）
 *
 * 支持的 Frontmatter 字段:
 * - name, description, version, tags (元数据)
 * - role, personality (认知配置)
 * - domains (领域, 支持数组或逗号分隔字符串)
 * - tools (工具, 支持数组或逗号分隔字符串)
 *
 * 生成的 IR 遵循 LIAS（Lightweight Industrial Agent Specification）规范
 *
 * 输出两种格式：
 * - LIASSkill：用于生成 TypeScript skill 文件（LIAS 运行时）
 * - GeneratedSkill：用于生成 SKILL.md 文件（Agent Skills 规范）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { LIASManifest, LIASSkill } from "../../types/ir.js";
import type { GeneratedSkill } from "../../skill-generator/index.js";

// 已知的 Agent 分类目录 -> 领域 映射
const CATEGORY_DOMAIN_MAP: Record<string, string> = {
  academic: "academic",
  design: "design",
  engineering: "engineering",
  "game-development": "game-development",
  integrations: "integrations",
  marketing: "marketing",
  "paid-media": "paid-media",
  product: "product",
  "project-management": "project-management",
  sales: "sales",
  "spatial-computing": "spatial-computing",
  specialized: "specialized",
  support: "support",
  testing: "testing",
};

export function parseAgentMd(filePath: string): LIASManifest {
  const content = fs.readFileSync(filePath, "utf-8");

  // 解析 Frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let frontmatter: Record<string, unknown> = {};
  if (fmMatch) {
    try {
      frontmatter = yaml.load(fmMatch[1]) as Record<string, unknown>;
    } catch {
      frontmatter = parseFrontmatterFallback(fmMatch[1]);
    }
  }
  const body = fmMatch ? content.slice(fmMatch[0].length).trim() : content;

  // 从文件路径提取分类目录
  const sourceCategory = extractCategoryFromPath(filePath);

  // 元数据
  const name = String(frontmatter.name ?? "未命名 Agent");
  const id = toKebabCase(name);

  // 领域优先级：frontmatter.domains > sourceCategory
  const domainsRaw = frontmatter.domains as string | string[] | undefined;
  let domains: { primary: string; secondary?: string[] } | undefined;
  if (domainsRaw) {
    domains = {
      primary: Array.isArray(domainsRaw) ? domainsRaw[0] : domainsRaw.split(",")[0].trim(),
      secondary: Array.isArray(domainsRaw)
        ? domainsRaw.slice(1)
        : domainsRaw.split(",").slice(1).map((s: string) => s.trim()),
    };
  } else if (sourceCategory) {
    domains = { primary: sourceCategory };
  }

  // 身份信息（从 body 解析）
  const identity = parseBodyIdentity(body, name);
  identity.objective = identity.capabilities.join("；") || `执行 ${name} 相关任务`;

  // 安全信息（从 body 解析）
  const safety = parseBodySafety(body);

  // 构建 Skills 列表
  // 1. 从 frontmatter.tools 的工具包装器
  const toolsRaw = frontmatter.tools as string | string[] | undefined;
  const toolSkills = normalizeToArray(toolsRaw).map((t: string) => ({
    name: toKebabCase(t),
    toolName: toSnakeCase(t),
    description: `${t} 工具`,
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    hasExecutor: false,
    isCapability: false,
  }));

  // 2. 从 capabilities 提取的实质性技能（相似度合并）
  // 返回两种格式：LIASSkill[]（TypeScript 用）+ GeneratedSkill[]（SKILL.md 用）
  const { liasSkills, generatedSkills } = buildSkillsFromCapabilities(
    identity.capabilities,
    toolSkills.map(s => s.toolName),
    identity.role,
    domains?.primary ?? "",
    frontmatter.tags as string[] | undefined
  );

  // Skills 合并（capabilities 优先，然后 tools）
  const allSkills = [...liasSkills, ...toolSkills.filter(
    ts => !liasSkills.some(cs => cs.toolName === ts.toolName)
  )];

  return {
    metadata: {
      id,
      name,
      version: String(frontmatter.version ?? "1.0.0"),
      description: String(frontmatter.description ?? identity.role ?? name),
      tags: buildTags(sourceCategory, frontmatter),
      author: frontmatter.author as string | undefined,
      sourceCategory,
    },
    identity: {
      role: identity.role,
      objective: identity.objective ?? identity.capabilities.join("；"),
      personality: identity.personality,
      vibe: identity.vibe,
      capabilities: identity.capabilities,
      style: identity.style,
    },
    safety,
    skills: allSkills.map(s => ({
      name: s.name,
      toolName: s.toolName,
      description: s.description,
      inputSchema: s.inputSchema as LIASSkill["inputSchema"],
    })),
    generatedSkills,
    provider: { type: "baize-loop", model: "claude-sonnet-4-20250514", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    source: { type: "agent-md", path: filePath, originalContent: content },
  };
}

/**
 * 从文件路径提取分类目录
 */
function extractCategoryFromPath(filePath: string): string | undefined {
  // 文件路径格式: /path/to/agency-agents/{category}/{agent-name}.md
  const parts = filePath.split(path.sep);
  // 查找 agency-agents 目录后的第一个子目录
  const agencyIdx = parts.findIndex(p => p === "agency-agents");
  if (agencyIdx >= 0 && agencyIdx + 1 < parts.length) {
    const category = parts[agencyIdx + 1];
    return CATEGORY_DOMAIN_MAP[category] ?? category;
  }
  return undefined;
}

/**
 * 从 capabilities 构建 Skill 定义
 *
 * 返回两种格式：
 * - liasSkills: LIASSkill[]（用于生成 TypeScript skill 文件）
 * - generatedSkills: GeneratedSkill[]（用于生成 SKILL.md 文件，Agent Skills 规范）
 */
function buildSkillsFromCapabilities(
  capabilities: string[],
  excludeToolNames: string[],
  agentRole: string,
  domain: string,
  tags?: string[]
): { liasSkills: LIASSkill[]; generatedSkills: GeneratedSkill[] } {
  // 1. 预处理：提取所有技能信息
  const rawSkills: { name: string; toolName: string; description: string; raw: string }[] = [];
  for (const cap of capabilities) {
    const info = extractSkillInfo(cap);
    if (!info) continue;
    if (excludeToolNames.includes(info.toolName)) continue;
    rawSkills.push(info);
  }

  // 2. 合并相似技能（按名称相似度）
  const mergedSkills = mergeSimilarSkills(rawSkills);

  // 3. 为每个技能生成两种格式
  const liasSkills: LIASSkill[] = [];
  const generatedSkills: GeneratedSkill[] = [];
  const allowedTools = ["Read", "Glob", "Grep", "Write", "Edit", "Bash"];

  for (const skill of mergedSkills) {
    const liasSkill = createSkillFromCapability(skill.name, skill.description, skill.raw, agentRole, domain);
    liasSkills.push(liasSkill as unknown as LIASSkill);

    generatedSkills.push({
      name: liasSkill.name,
      description: liasSkill.description,
      allowedTools,
      metadata: { tags: [...new Set([domain, ...(tags ?? [])])].filter(Boolean).join(" ") },
      markdownBody: generateSkillMarkdownBody(liasSkill.name, liasSkill.description, agentRole, domain),
      generatedBy: "rule",
    });
  }

  return { liasSkills, generatedSkills };
}

/**
 * 从 capability 文本提取技能名称、工具名和描述
 */
function extractSkillInfo(cap: string): { name: string; toolName: string; description: string; raw: string } | null {
  if (!cap || cap.length < 5) return null;

  // 过滤无意义项
  if (/^(Hard rule|PRIORITY|DEFAULT|NOTE|TIP|REMEMBER|ALWAYS|NEVER)[:：]/i.test(cap)) return null;

  let name: string;
  let description: string;

  const colonIdx = cap.indexOf(":");
  if (colonIdx > 0 && colonIdx < 50) {
    name = cap.slice(0, colonIdx).trim();
    description = cap.length > 100 ? cap.slice(0, 97) + "..." : cap;
  } else {
    name = cap.length > 40 ? cap.slice(0, 37) + "..." : cap;
    description = name;
  }

  // 清理名称（移除各种破折号和特殊字符）
  let cleanName = name
    .replace(/[—–−–_]/g, " ")  // 各种破折号转为空格
    .replace(/[:：,.!?()[\]{}【】『』「」<>《》\/\\|`~@#$%^&*+=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanName.length < 2) return null;

  const toolName = toSnakeCase(cleanName);
  if (toolName.length < 2) return null;

  return { name: cleanName, toolName, description, raw: cap };
}

/**
 * 合并相似技能（按名称相似度）
 * 规则：1. 完全相同 → 合并  2. 一个包含另一个 → 合并  3. 相似度 > 0.7 → 合并
 */
function mergeSimilarSkills(
  skills: { name: string; toolName: string; description: string; raw: string }[]
): { name: string; toolName: string; description: string; raw: string }[] {
  const result: typeof skills = [];
  const used = new Set<number>();

  for (let i = 0; i < skills.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    let current = skills[i];
    let merged = false;

    for (let j = i + 1; j < skills.length; j++) {
      if (used.has(j)) continue;
      const s2 = skills[j];
      if (areSimilarNames(current.name, s2.name)) {
        // 合并：取较长的描述
        if (s2.description.length > current.description.length) {
          current = { name: current.name, toolName: current.toolName, description: s2.description, raw: s2.raw };
        }
        used.add(j);
        merged = true;
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * 判断两个技能名是否相似（归一化后完全相同/包含/相似度>0.7）
 */
function areSimilarNames(a: string, b: string): boolean {
  const aNorm = a.toLowerCase().replace(/[-_\s]+/g, "").replace(/'/g, "");
  const bNorm = b.toLowerCase().replace(/[-_\s]+/g, "").replace(/'/g, "");
  if (aNorm === bNorm) return true;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;
  if (similarity(aNorm, bNorm) > 0.7) return true;
  return false;
}

/**
 * 计算两个字符串的相似度（编辑距离）
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * 从 capability 文本提取技能名称和描述（保留供兼容）
 * @deprecated 请使用 extractSkillInfo
 */
function extractSkillFromCapability(cap: string): { name: string; toolName: string; description: string } | null {
  const info = extractSkillInfo(cap);
  if (!info) return null;
  return { name: info.name, toolName: info.toolName, description: info.description };
}

function createSkillFromCapability(
  name: string,
  description: string,
  rawCapability: string,
  agentRole: string,
  domain: string
) {
  const titleName = name
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const definition = `## Identity

- **Name**: ${titleName}
- **Role**: ${agentRole}
- **Domain**: ${domain || "通用"}
- **Version**: 1.0.0

## Instructions

1. 理解任务需求，明确 ${titleName} 的目标和范围
2. 收集相关信息和上下文
3. 按照领域最佳实践执行 ${titleName} 任务
4. 验证输出质量，确保符合要求
5. 如有不确定之处，主动寻求澄清

## Guidelines

- **优先级**: 以任务目标为导向，追求实际价值
- **输出格式**: 清晰、结构化、可执行
- **边界处理**: 遇到超出范围的问题时，明确告知并建议替代方案
- **质量标准**: 结果应可直接使用或参考，避免模糊表述

## Tools

- **Read**: 读取现有文件或上下文
- **Edit**: 修改现有文件
- **Write**: 创建新文件
- **Bash**: 执行必要的命令行操作
- **Glob**: 搜索相关文件
- **Grep**: 查找特定内容`;

  return {
    name: toKebabCase(name),
    toolName: toSnakeCase(name),
    description,
    inputSchema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "待完成的任务描述",
        },
      },
      required: ["task"],
    },
    definition,
    hasExecutor: false,
    isCapability: true,
    tags: [],
  };
}

/**
 * 生成 SKILL.md Markdown 正文
 * 遵循 Agent Skills 规范推荐结构：使用步骤、输入输出示例、边界情况
 */
function generateSkillMarkdownBody(name: string, description: string, agentRole: string, domain: string): string {
  const titleName = name
    .split(/[\s-]+/)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return `## 使用步骤

1. 理解任务需求，明确 ${titleName} 的目标和范围
2. 收集相关信息和上下文
3. 按照领域最佳实践执行任务
4. 验证输出质量，确保符合要求
5. 如有不确定之处，主动寻求澄清

## 输入输出示例

**输入**：任务描述或相关参数

**输出**：执行结果或结构化响应

## 边界情况

- 遇到超出范围的问题时，明确告知并建议替代方案
- 数据缺失或不完整时，说明原因并提供可用的部分结果
`;
}

/**
 * 构建标签列表
 */
function buildTags(sourceCategory: string | undefined, frontmatter: Record<string, unknown>): string[] {
  const tags: string[] = [];

  // 来自 frontmatter.tags
  const fmTags = normalizeToArray(frontmatter.tags as string | string[] | undefined);
  tags.push(...fmTags);

  // 来自分类目录
  if (sourceCategory) {
    // 将分类名转为复数形式（如果合理）
    const categoryTag = sourceCategory.replace("-", "_");
    if (!tags.includes(categoryTag)) {
      tags.push(categoryTag);
    }
  }

  return [...new Set(tags)]; // 去重
}

/**
 * 将字符串或数组统一转换为数组
 */
function normalizeToArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    // 逗号分隔的工具名列表
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 判断章节是否为安全相关章节
 */
function isSafetyHeading(heading: string): boolean {
  const h = heading.toLowerCase();
  return h.includes("safety") ||
    h.includes("guardrail") ||
    h.includes("hard rule") ||
    h.includes("prohibited") ||
    h.includes("禁止") ||
    h.includes("红线") ||
    h.includes("约束") ||
    h.includes("boundary") ||
    h.includes("constraint") ||
    h.includes("dos and donts") ||
    h.includes("do's and don'ts") ||
    h.includes("dos & donts") ||
    h.includes("安全");
}

/**
 * 判断列表项是否为 prohibited 规则
 * 仅匹配明确的禁止前缀或开头的禁止词
 */
function isProhibitedItem(item: string): boolean {
  // 前缀匹配：NEVER/Never/禁止/绝对禁止/不得/不可/不能/严禁/不要
  if (/^(NEVER|Never|禁止|绝对禁止|不得|不可|不能|严禁|不要)[.:]?\s/i.test(item)) return true;
  // 开头禁止模式：在列表项内容开头有明确的禁止词（never/don't/must not/不可/不得等）
  // 要求禁止词紧跟列表标记之后（前 30 字符内），排除描述中嵌入的 "do not"
  const first30 = item.slice(0, 30).replace(/^[-*]+\s*/, "");
  if (/\b(never\b|don't\b|do not\b|cannot\b|must not\b|不可\b|不得\b|禁止\b|严禁\b)/i.test(first30)) {
    return true;
  }
  // 特殊禁止标记词
  if (/\b(prohibited|restricted|disallowed|红线|禁忌)\b/i.test(item) && item.length >= 10) return true;
  return false;
}

/**
 * 判断列表项是否为 constraint 规则
 * 仅限安全章节或显式 ALWAYS/must/should 标记
 */
function isConstraintItem(item: string, inSafetySection: boolean): boolean {
  // 前缀匹配：ALWAYS/Always/必须/一定要/务必要
  if (/^(ALWAYS|Always|必须|一定要|务必要)[.:]?\s/i.test(item)) return true;
  // 在安全章节中：显式 must/should/always 标记
  if (inSafetySection) {
    if (/\b(必须|应该|应当|must|should|always|required|need to|必须先|必须确保)/i.test(item)) return true;
  }
  return false;
}

/**
 * 从 agent.md body 提取安全信息
 * - prohibited: NEVER 规则、禁止行为、绝对禁止（从任何章节提取）
 * - constraints: ALWAYS 规则、必须遵循（仅安全章节或显式标记）
 * - fallback: 无法满足时的拒绝逻辑
 */
function parseBodySafety(body: string): { prohibited: string[]; constraints: string[]; fallback: string[] } {
  const prohibited: string[] = [];
  const constraints: string[] = [];
  const fallback: string[] = [];
  const seenProhibited = new Set<string>();
  const seenConstraints = new Set<string>();
  const seenFallback = new Set<string>();

  // 先尝试从 frontmatter 提取
  const fmMatch = body.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    try {
      const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
      const fmSafety = fm["safety"] as Record<string, unknown> | undefined;
      if (fmSafety) {
        const fmProhibited = normalizeToArray(fmSafety["prohibited"] as string | string[] | undefined);
        const fmConstraints = normalizeToArray(fmSafety["constraints"] as string | string[] | undefined);
        const fmFallback = normalizeToArray(fmSafety["fallback"] as string | string[] | undefined);
        for (const p of fmProhibited) { if (!seenProhibited.has(p)) { seenProhibited.add(p); prohibited.push(p); } }
        for (const c of fmConstraints) { if (!seenConstraints.has(c)) { seenConstraints.add(c); constraints.push(c); } }
        for (const fb of fmFallback) { if (!seenFallback.has(fb)) { seenFallback.add(fb); fallback.push(fb); } }
      }
    } catch { /* ignore */ }
  }

  // 按章节拆分 body（不含 frontmatter）
  const bodyWithoutFm = fmMatch ? body.slice(fmMatch[0].length) : body;
  const sections = bodyWithoutFm.split(/^##\s+/m);

  for (const section of sections) {
    const lines = section.split("\n");
    const headingRaw = lines[0]?.trim() ?? "";
    const inSafetySection = isSafetyHeading(headingRaw);

    for (const l of lines) {
      const line = l.trim();
      if (!line || line.startsWith("#") || line.startsWith("```")) continue;

      // 提取列表项
      if (line.startsWith("-") || line.startsWith("*") || line.startsWith("  -") || line.startsWith("  *")) {
        let item = line.replace(/^[-*]+\s*/, "").trim();
        item = item.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
        if (!item || item.length < 3) continue;

        // prohibited: 从任何章节提取
        if (isProhibitedItem(item) && !seenProhibited.has(item)) {
          seenProhibited.add(item);
          prohibited.push(item);
        }

        // constraints: 仅安全章节或显式标记
        if (isConstraintItem(item, inSafetySection) && !seenConstraints.has(item)) {
          seenConstraints.add(item);
          constraints.push(item);
        }
      }

      // 独立行的 NEVER 规则（从任何章节提取）
      const neverStandalone = line.match(/^(NEVER|Never)[.:]\s*(.+)/i);
      if (neverStandalone) {
        const item = neverStandalone[2].trim().replace(/\*\*(.+?)\*\*/g, "$1");
        if (!seenProhibited.has(item)) { seenProhibited.add(item); prohibited.push(item); }
      }

      // 独立行的 ALWAYS 规则
      const alwaysStandalone = line.match(/^(ALWAYS|Always)[.:]\s*(.+)/i);
      if (alwaysStandalone && inSafetySection) {
        const item = alwaysStandalone[2].trim().replace(/\*\*(.+?)\*\*/g, "$1");
        if (!seenConstraints.has(item)) { seenConstraints.add(item); constraints.push(item); }
      }

      // Fallback / 拒绝逻辑（排除文档片段）
      if (/\b(fallback|fall back|unable to|cannot fulfill|reject|拒绝|cannot handle|超出范围|超出能力|超出职责)/i.test(line) &&
          !seenFallback.has(line) &&
          !line.startsWith("- [ ]") &&
          !line.match(/^\d+\.\s+\*\*/) &&
          line.length > 20 &&
          line.length < 200) {
        seenFallback.add(line);
        fallback.push(line);
      }
    }
  }

  // 限制每类数量上限，防止过度提取
  const maxItems = 10;
  if (prohibited.length > maxItems) prohibited.length = maxItems;
  if (constraints.length > maxItems) constraints.length = maxItems;
  if (fallback.length > maxItems) fallback.length = maxItems;

  // 如果没有提取到 prohibited，始终提供默认禁止规则（L050 要求）
  if (prohibited.length === 0) {
    prohibited.push("禁止执行任何可能违反法规或道德的操作");
    prohibited.push("禁止修改或删除未经验证的原始文件");
  }
  // 如果同时没有 constraints 和 fallback，提供完整默认值
  if (constraints.length === 0 && fallback.length === 0) {
    constraints.push("在执行任何关键操作前，必须获得用户明确确认");
    constraints.push("所有输出必须经过质量验证");
    fallback.push("如果任务超出能力范围或无法安全执行，明确告知用户并建议替代方案");
  }

  return { prohibited, constraints, fallback };
}

/**
 * Frontmatter 回退解析（当 YAML 解析失败时使用）
 * 通过正则提取 name, description, tools 等关键字段
 */
function parseFrontmatterFallback(fmText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 提取 name
  const nameMatch = fmText.match(/^name:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  // 提取 description
  const descMatch = fmText.match(/^description:\s*(.+)$/m);
  if (descMatch) result.description = descMatch[1].trim();

  // 提取 tools
  const toolsMatch = fmText.match(/^tools:\s*(.+)$/m);
  if (toolsMatch) result.tools = toolsMatch[1].trim();

  // 提取 domains
  const domainsMatch = fmText.match(/^domains:\s*(.+)$/m);
  if (domainsMatch) result.domains = domainsMatch[1].trim();

  // 提取 version
  const versionMatch = fmText.match(/^version:\s*(.+)$/m);
  if (versionMatch) result.version = versionMatch[1].trim();

  // 提取 emoji
  const emojiMatch = fmText.match(/^emoji:\s*(.+)$/m);
  if (emojiMatch) result.emoji = emojiMatch[1].trim();

  // 提取 color
  const colorMatch = fmText.match(/^color:\s*(.+)$/m);
  if (colorMatch) result.color = colorMatch[1].trim();

  // 提取 vibe
  const vibeMatch = fmText.match(/^vibe:\s*(.+)$/m);
  if (vibeMatch) result.vibe = vibeMatch[1].trim();

  // 提取 role
  const roleMatch = fmText.match(/^role:\s*(.+)$/m);
  if (roleMatch) result.role = roleMatch[1].trim();

  // 提取 tags
  const tagsMatch = fmText.match(/^tags:\s*(.+)$/m);
  if (tagsMatch) result.tags = tagsMatch[1].trim();

  return result;
}

function parseBodyIdentity(body: string, fallbackName: string): { role: string; objective?: string; personality?: string; vibe?: string; capabilities: string[]; style: string[] } {
  const capabilities: string[] = [];
  const style: string[] = [];
  let role = fallbackName;
  let personality: string | undefined;
  let vibe: string | undefined;

  const sections = body.split(/^##\s+/m);
  for (const section of sections) {
    const lines = section.split("\n");
    // 提取标题（去除 emoji）
    const headingRaw = lines[0]?.trim() ?? "";
    const heading = headingRaw.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{200D}]|[\u{FE0F}]/gu, "").trim();
    const headingLower = heading.toLowerCase();

    // Design Agent 格式: ## 🧠 Your Identity & Mindset / ## Your Identity
    if (headingLower.includes("identity") || headingLower.includes("你的身份")) {
      for (const l of lines.slice(1)) {
        const line = l.trim();
        // 提取 Role（支持多种格式）
        const roleMatch = line.match(/^\*?\*?Role\*?\*?:\s*(.+)/i);
        if (roleMatch) {
          const roleVal = roleMatch[1].trim().replace(/\*\*/g, "");
          if (!role || role === fallbackName) {
            role = roleVal;
          }
        }
        // 提取 Philosophy
        const philosophyMatch = line.match(/^\*?\*?Philosophy\*?\*?:\s*(.+)/i);
        if (philosophyMatch) {
          if (!vibe) vibe = philosophyMatch[1].trim().replace(/\*\*/g, "");
        }
        // 提取 Personality
        const personalityMatch = line.match(/^\*?\*?Personality\*?\*?:\s*(.+)/i);
        if (personalityMatch) {
          personality = personalityMatch[1].trim().replace(/\*\*/g, "");
        }
        // 提取 Memory
        const memoryMatch = line.match(/^\*?\*?Memory\*?\*?:\s*(.+)/i);
        if (memoryMatch) {
          if (!vibe) vibe = memoryMatch[1].trim().replace(/\*\*/g, "");
        }
        // 提取 Experience
        const expMatch = line.match(/^\*?\*?Experience\*?\*?:\s*(.+)/i);
        if (expMatch) {
          if (!vibe) vibe = expMatch[1].trim().replace(/\*\*/g, "");
        }
        // 提取列表项作为能力
        if (line.startsWith("-") || line.startsWith("*")) {
          let item = line.replace(/^[-*]\s*/, "").trim();
          item = item.replace(/\*\*(.+?)\*\*/g, "$1");
          if (item && !item.includes(":") && item.length > 10) {
            capabilities.push(item);
          }
        }
      }
      continue;
    }

    // Design Agent 格式: ## 🎯 Your Core Mission / ## 🚀 Core Mission
    if (headingLower.includes("mission") || headingLower.includes("能力") || headingLower.includes("capabilit") || headingLower.includes("specialized")) {
      const seenCapabilities = new Set<string>();
      for (const l of lines.slice(1)) {
        const line = l.trim();
        if (line.startsWith("-") || line.startsWith("*")) {
          let item = line.replace(/^[-*]\s*/, "").trim();
          // 去除粗体标记 **text** -> text
          item = item.replace(/\*\*(.+?)\*\*/g, "$1");
          // 跳过子标题和代码块
          if (item && !item.startsWith("**") && !item.startsWith("```") && !item.startsWith("#")) {
            // 过滤太短或无意义的项
            if (item.length < 5) continue;
            // 过滤纯标签性项（如 "Hard rule: ..."）
            if (/^(Hard rule|PRIORITY|DEFAULT|NOTE|TIP|REMEMBER|ALWAYS|NEVER)[:：]/i.test(item)) continue;
            // 去重
            if (!seenCapabilities.has(item)) {
              seenCapabilities.add(item);
              capabilities.push(item);
            }
          }
        }
      }
      continue;
    }

    // Design Agent 格式: ## 💭 Communication Style / ## 🎨 Your Style
    if (headingLower.includes("style") || headingLower.includes("communication") || headingLower.includes("风格")) {
      for (const l of lines.slice(1)) {
        const line = l.trim();
        if (line.startsWith("-") || line.startsWith("*")) {
          const item = line.replace(/^[-*]\s*/, "").trim();
          if (item && !item.includes("```")) {
            style.push(item);
          }
        }
      }
      continue;
    }

    // 标准格式: ## Capabilities / ## 能力
    if (headingLower.includes("capabilit") || headingLower.includes("能力")) {
      for (const l of lines.slice(1)) {
        if (l.trim().startsWith("-") || l.trim().startsWith("*")) {
          capabilities.push(l.replace(/^[-*]\s*/, "").trim());
        }
      }
    }
    // 标准格式: ## Style / ## 风格
    if (headingLower.includes("style") || headingLower.includes("风格")) {
      for (const l of lines.slice(1)) {
        if (l.trim().startsWith("-") || l.trim().startsWith("*")) {
          style.push(l.replace(/^[-*]\s*/, "").trim());
        }
      }
    }
  }

  // 从 body 开头提取描述性信息
  const firstParagraph = body.split("\n\n")[0] ?? "";
  if (firstParagraph.startsWith("# ")) {
    role = firstParagraph.replace(/^#\s+/, "").trim();
  }
  // 提取 ## Role Definition
  const roleMatch = body.match(/^##\s+Role\s+Definition\n([\s\S]*?)(?=\n##|\n#|$)/im);
  if (roleMatch) {
    const roleText = roleMatch[1].trim();
    // 取第一段非列表行作为角色描述（限制长度）
    const firstLine = roleText
      .split("\n")
      .find(l => {
        const trimmed = l.trim();
        return trimmed && !trimmed.startsWith("-") && !trimmed.startsWith("*") && !trimmed.startsWith("```");
      });
    if (firstLine) {
      const line = firstLine.trim();
      // 限制角色描述长度（不超过 100 字符）
      role = line.length > 100 ? line.slice(0, 97) + "..." : line;
    }
  }
  const descMatch = body.match(/You are (?:a |an )?(.+?)(?:\.|,|\n)/i);
  if (descMatch && (!role || role === fallbackName)) {
    role = descMatch[1].trim();
  }

  return {
    role,
    personality,
    vibe,
    capabilities: capabilities.length > 0 ? capabilities : ["通用能力"],
    style: style.length > 0 ? style : ["专业规范"],
  };
}

function toKebabCase(str: string): string {
  // 先清理：移除 ' " --- / & ( ) × → 等非法字符
  const cleaned = str
    .replace(/'/g, "")           // 移除撇号
    .replace(/"/g, "")           // 移除引号
    .replace(/[—–−–]/g, "-")    // 各种破折号统一为连字符
    .replace(/---/g, "-")       // 三连破折号
    .replace(/--/g, "-")        // 双连破折号
    .replace(/[×→+]/g, "-")     // 特殊符号
    .replace(/[&()[\]{}|<>!@#$%^*=]/g, " ")  // 括号和符号
    .replace(/[./\\]/g, "-")    // 斜杠和反斜杠
    .replace(/[^\w\s-]/g, " ")  // 其他非字母数字字符（保留字母数字空格连字符）
    .replace(/\s+/g, " ")       // 合并空格
    .trim();

  return cleaned
    .replace(/^-+|-+$/g, "")    // 去除首尾连字符
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")        // 合并重复连字符
    .replace(/^-+|-+$/g, "")    // 再次去除首尾
    .toLowerCase()
    .replace(/^(\d)/, "n-$1");  // 数字开头加前缀 n-
}

function toSnakeCase(str: string): string {
  // 先清理：移除 ' " --- / & ( ) × → 等非法字符
  const cleaned = str
    .replace(/'/g, "")           // 移除撇号
    .replace(/"/g, "")           // 移除引号
    .replace(/[—–−–]/g, "-")    // 各种破折号统一为连字符
    .replace(/---/g, "-")       // 三连破折号
    .replace(/--/g, "-")        // 双连破折号
    .replace(/[×→+]/g, "-")     // 特殊符号
    .replace(/[&()[\]{}|<>!@#$%^*=]/g, " ")  // 括号和符号
    .replace(/[./\\]/g, "-")    // 斜杠和反斜杠
    .replace(/[^\w\s-]/g, " ")  // 其他非字母数字字符
    .replace(/\s+/g, " ")       // 合并空格
    .trim();

  return cleaned
    .replace(/^-+|-+$/g, "")    // 去除首尾连字符
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")        // 合并重复下划线
    .replace(/^_+|_+$/g, "")    // 再次去除首尾
    .toLowerCase()
    .replace(/^(\d)/, "n_$1"); // 数字开头加前缀 n_
}

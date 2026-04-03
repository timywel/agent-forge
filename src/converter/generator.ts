/**
 * LIAS Agent 项目生成器
 * 从 LIASManifest 生成标准 LIAS Agent 项目
 *
 * 生成内容：
 * 1. TypeScript 项目文件（skills/*.ts, src/*.ts, prompts/*.md, main.ts, package.json）
 * 2. SKILL.md 文件（.claude/skills/{name}/SKILL.md，Claude Code 用户可调用）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { LIASManifest, LIASSkill, JSONSchemaProperty } from "../types/ir.js";
import type { GeneratedSkill } from "../skill-generator/index.js";
import { generatedSkillToMd, toKebabCase } from "../skill-generator/index.js";

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 从 LIASManifest 生成标准 TypeScript Agent 项目
 * 返回生成的文件路径列表（相对于 outputDir）
 */
export function generate(ir: LIASManifest, outputDir: string): string[] {
  const resolved = path.resolve(outputDir);
  const files: string[] = [];

  // 创建所有必要目录
  const dirs = [
    resolved,
    path.join(resolved, "skills"),
    path.join(resolved, "prompts"),
    path.join(resolved, "src"),
    path.join(resolved, ".claude", "skills"),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  // 1. package.json
  const pkg = generatePackageJson(ir);
  write(resolved, "package.json", pkg);
  files.push("package.json");

  // 2. main.ts
  const mainTs = generateMainTs(ir);
  write(resolved, "main.ts", mainTs);
  files.push("main.ts");

  // 3. src/types.ts
  const typesTs = generateTypesTs(ir);
  write(resolved, "src/types.ts", typesTs);
  files.push("src/types.ts");

  // 4. src/provider.ts
  const providerTs = generateProviderTs(ir);
  write(resolved, "src/provider.ts", providerTs);
  files.push("src/provider.ts");

  // 5. src/loop.ts
  const loopTs = generateLoopTs(ir);
  write(resolved, "src/loop.ts", loopTs);
  files.push("src/loop.ts");

  // 6. prompts/system.md
  const systemMd = generateSystemMd(ir);
  write(resolved, "prompts/system.md", systemMd);
  files.push("prompts/system.md");

  // 7. prompts/safety.md
  const safetyMd = generateSafetyMd(ir);
  write(resolved, "prompts/safety.md", safetyMd);
  files.push("prompts/safety.md");

  // 8. skills/*.ts（TypeScript skill 文件，ReAct 循环内部工具）
  if (ir.skills.length > 0) {
    for (const skill of ir.skills) {
      const skillTs = generateSkillTs(skill);
      write(resolved, `skills/${skill.name}.ts`, skillTs);
      files.push(`skills/${skill.name}.ts`);
    }

    // 9. skills/index.ts
    const indexTs = generateSkillIndex(ir.skills);
    write(resolved, "skills/index.ts", indexTs);
    files.push("skills/index.ts");
  }

  // 10. .claude/skills/*.md（SKILL.md 文件，Claude Code 用户可调用）
  // 每个 capability 生成一个 SKILL.md 文件
  if (ir.generatedSkills && ir.generatedSkills.length > 0) {
    for (const skill of ir.generatedSkills) {
      const skillName = toKebabCase(skill.name);
      const skillDir = path.join(resolved, ".claude", "skills", skillName);
      fs.mkdirSync(skillDir, { recursive: true });

      const skillMdContent = generatedSkillToMd(skill);
      write(resolved, path.join(".claude", "skills", skillName, "SKILL.md"), skillMdContent);
      files.push(path.join(".claude", "skills", skillName, "SKILL.md"));
    }
  } else if (ir.skills.length > 0) {
    // 如果没有 generatedSkills，从 LIASSkill 生成一个默认的 SKILL.md
    const agentSkillMd = generateAgentSkillMd(ir);
    const agentSkillDir = path.join(resolved, ".claude", "skills", ir.metadata.id);
    fs.mkdirSync(agentSkillDir, { recursive: true });
    write(resolved, path.join(".claude", "skills", ir.metadata.id, "SKILL.md"), agentSkillMd);
    files.push(path.join(".claude", "skills", ir.metadata.id, "SKILL.md"));
  }

  return files;
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function write(base: string, rel: string, content: string): void {
  fs.writeFileSync(path.join(base, rel), content, "utf-8");
}

// ---------------------------------------------------------------------------
// 1. package.json
// ---------------------------------------------------------------------------

function generatePackageJson(ir: LIASManifest): string {
  const pkg: Record<string, unknown> = {
    name: ir.metadata.id,
    version: ir.metadata.version,
    description: ir.metadata.description,
    type: "module",
    main: "main.js",
    scripts: {
      build: "tsc",
      start: "node --loader ts-node/esm main.ts",
      "typecheck": "tsc --noEmit",
    },
    dependencies: {
      "@anthropic/sdk": "^0.52.0",
      "@baize-loop/sdk": "^1.0.0",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      "typescript": "^5.7.0",
      "ts-node": "^10.9.0",
    },
  };

  if (ir.metadata.author) {
    pkg["author"] = ir.metadata.author;
  }
  if (ir.metadata.tags?.length) {
    pkg["keywords"] = ir.metadata.tags;
  }

  return JSON.stringify(pkg, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// 2. main.ts
// ---------------------------------------------------------------------------

function generateMainTs(ir: LIASManifest): string {
  const lines: string[] = [
    `/**`,
    ` * ${ir.metadata.name}`,
    ` * ${ir.metadata.description}`,
    ` */`,
    ``,
    `import { run } from "./src/loop.js";`,
    `import type { ToolUseContext } from "@anthropic/sdk";`,
    ``,
    `/**`,
    ` * 入口函数`,
    ` * @param input 用户输入`,
    ` * @param context LLM 工具调用上下文`,
    ` */`,
    `export async function agent(input: string, context: ToolUseContext): Promise<string> {`,
    `  return run(input, context);`,
    `}`,
    ``,
    `// CLI 入口`,
    `async function main() {`,
    `  const args = process.argv.slice(2);`,
    `  if (args.length === 0) {`,
    `    console.error("用法: node main.js <task>");`,
    `    process.exit(1);`,
    `  }`,
    `  const input = args.join(" ");`,
    `  const context = {} as ToolUseContext;`,
    `  const result = await agent(input, context);`,
    `  console.log(result);`,
    `}`,
    ``,
    `main().catch((err) => {`,
    `  console.error("Agent 运行失败:", err);`,
    `  process.exit(1);`,
    `});`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 3. src/types.ts
// ---------------------------------------------------------------------------

function generateTypesTs(_ir: LIASManifest): string {
  const lines: string[] = [
    `/**`,
    ` * 共享类型定义`,
    ` */`,
    ``,
    `import type { Tool, ToolUseContext } from "@anthropic/sdk";`,
    ``,
    `/**`,
    ` * Agent 运行状态`,
    ` */`,
    `export interface AgentState {`,
    `  input: string;`,
    `  history: Array<{ role: "user" | "assistant"; content: string }>;`,
    `  iterations: number;`,
    `  maxIterations: number;`,
    `}`,
    ``,
    `/**`,
    ` * 工具执行结果`,
    ` */`,
    `export interface FormattedResult {`,
    `  result: unknown;`,
    `  format: "json" | "text" | "markdown";`,
    `}`,
    ``,
    `/**`,
    ` * 动态导入 prompts/*.md`,
    ` */`,
    `export async function loadPrompts(filename: string): Promise<string> {`,
    `  const nodePath = await import("node:path");`,
    `  const nodeFs = await import("node:fs");`,
    `  const promptsDir = nodePath.join(import.meta.dirname, "..", "prompts");`,
    `  return nodeFs.readFileSync(nodePath.join(promptsDir, filename), "utf-8");`,
    `}`,
    ``,
    `// Re-export Tool type for consumers`,
    `export type { Tool, ToolUseContext };`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. src/provider.ts
// ---------------------------------------------------------------------------

function generateProviderTs(ir: LIASManifest): string {
  const providerType = ir.provider?.type ?? "claude";
  const model = ir.provider?.model ?? "claude-sonnet-4-20250514";
  const apiKeyVar = ir.provider?.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";

  const lines: string[] = [
    `/**`,
    ` * LLM Provider 配置`,
    ` */`,
    ``,
    `import { createProvider } from "@baize-loop/sdk";`,
    ``,
    `export const provider = createProvider({`,
    `  type: "${providerType}",`,
    `  model: "${model}",`,
    `  apiKey: process.env.${apiKeyVar},`,
    `});`,
    ``,
    `export const llm = provider.createClient();`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 5. src/loop.ts
// ---------------------------------------------------------------------------

function generateLoopTs(ir: LIASManifest): string {
  const maxIterations = ir.harness?.maxIterations ?? 10;

  const lines: string[] = [
    `/**`,
    ` * ReAct 循环`,
    ` */`,
    ``,
    `import type { ToolUseContext } from "@anthropic/sdk";`,
    `import { allTools } from "../skills/index.js";`,
    `import { llm } from "./provider.js";`,
    `import { loadPrompts } from "./types.js";`,
    ``,
    `const SYSTEM = await loadPrompts("system.md");`,
    `const SAFETY = await loadPrompts("safety.md");`,
    ``,
    `/**`,
    ` * 单次 ReAct 迭代`,
    ` */`,
    `async function loop(input: string, context: ToolUseContext): Promise<string> {`,
    `  const prompt = \`\${SYSTEM}\\n\\n\${SAFETY}\\n\\n## Input\\n\${input}\`;`,
    ``,
    `  const response = await llm.chat(prompt, allTools, {`,
    `    maxTokens: ${ir.harness?.maxTokens ?? 8192},`,
    `    temperature: ${ir.harness?.temperature ?? 0.3},`,
    `  });`,
    ``,
    `  // 处理文本响应`,
    `  if (response.type === "text") {`,
    `    return response.content;`,
    `  }`,
    ``,
    `  // 处理工具调用`,
    `  if (response.type === "tool_use") {`,
    `    const toolName = response.name;`,
    `    const args = response.input;`,
    ``,
    `    const tool = allTools.find((t) => t.name === toolName);`,
    `    if (!tool) {`,
    `      return \`错误: 未找到工具 '\${toolName}'\`;`,
    `    }`,
    ``,
    `    try {`,
    `      const execResult = await tool.execute(args as never, context);`,
    `      const toolOutput = typeof execResult === "string"`,
    `        ? execResult`,
    `        : JSON.stringify(execResult);`,
    `      // 将工具结果追加到输入，继续循环`,
    `      return await loop(\`工具 '\${toolName}' 返回: \${toolOutput}\`, context);`,
    `    } catch (error) {`,
    `      const errMsg = error instanceof Error ? error.message : String(error);`,
    `      return \`工具 '\${toolName}' 执行失败: \${errMsg}\`;`,
    `    }`,
    `  }`,
    ``,
    `  return "Agent 未能产生有效响应";`,
    `}`,
    ``,
    `/**`,
    ` * 运行 Agent`,
    ` */`,
    `export async function run(input: string, context: ToolUseContext): Promise<string> {`,
    `  let iterations = 0;`,
    `  const maxIterations = ${maxIterations};`,
    `  let currentInput = input;`,
    ``,
    `  while (iterations < maxIterations) {`,
    `    iterations++;`,
    `    const result = await loop(currentInput, context);`,
    ``,
    `    // 简单终止条件：结果不含 tool_call 指令`,
    `    if (!result.includes("tool_use")) {`,
    `      return result;`,
    `    }`,
    ``,
    `    currentInput = result;`,
    `  }`,
    ``,
    `  return \`Agent 在 \${maxIterations} 次迭代后未能完成\`;`,
    `}`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 6. prompts/system.md
// ---------------------------------------------------------------------------

function generateSystemMd(ir: LIASManifest): string {
  const lines: string[] = [];

  // 标题
  lines.push(`# ${ir.identity.role} — 角色定义`);
  lines.push("");

  // Identity
  lines.push("## Identity");
  lines.push(`- **Role**: ${ir.identity.role}`);
  lines.push(`- **Objective**: ${ir.identity.objective}`);
  if (ir.identity.personality) {
    lines.push(`- **Personality**: ${ir.identity.personality}`);
  }
  if (ir.identity.vibe) {
    lines.push(`- **Vibe**: ${ir.identity.vibe}`);
  }
  lines.push("");

  // Objective（完整描述）
  lines.push("## Objective");
  lines.push(ir.identity.objective);
  lines.push("");

  // Capabilities
  if (ir.identity.capabilities.length > 0) {
    lines.push("## Capabilities");
    for (const cap of ir.identity.capabilities) {
      lines.push(`- ${cap}`);
    }
    lines.push("");
  }

  // SOP
  if (ir.identity.sop && ir.identity.sop.length > 0) {
    lines.push("## SOP (Standard Operating Procedure)");
    for (const step of ir.identity.sop) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  // Style
  if (ir.identity.style.length > 0) {
    lines.push("## Style");
    for (const s of ir.identity.style) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  // Output Format
  if (ir.identity.outputFormat) {
    lines.push("## Output Format");
    lines.push(ir.identity.outputFormat);
    lines.push("");
  }

  // Collaboration
  if (ir.collaboration?.handoffsTo && ir.collaboration.handoffsTo.length > 0) {
    lines.push("## Collaboration");
    for (const h of ir.collaboration.handoffsTo) {
      lines.push(`- **Handoff to \`${h.agent}\`**: ${h.trigger}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 7. prompts/safety.md
// ---------------------------------------------------------------------------

function generateSafetyMd(ir: LIASManifest): string {
  const lines: string[] = [];

  lines.push("# Safety & Guardrails");
  lines.push("");

  // Prohibited Actions
  if (ir.safety.prohibited.length > 0) {
    lines.push("## Prohibited Actions");
    lines.push("");
    for (const p of ir.safety.prohibited) {
      lines.push(`- **NEVER**: ${p}`);
    }
    lines.push("");
  }

  // Domain Constraints
  if (ir.safety.constraints.length > 0) {
    lines.push("## Domain Constraints");
    lines.push("");
    for (const c of ir.safety.constraints) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Fallback Logic
  if (ir.safety.fallback.length > 0) {
    lines.push("## Fallback Logic");
    lines.push("");
    lines.push("When the request cannot be fulfilled, respond with:");
    for (const f of ir.safety.fallback) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 8. skills/[name].ts
// ---------------------------------------------------------------------------

function generateSkillTs(skill: LIASSkill): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Skill: ${skill.name}`);
  lines.push(` * ${skill.description}`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import { Tool, z } from "@anthropic/sdk";`);
  lines.push(``);

  // --- JSON Schema export ---
  const schemaJson = buildSchemaJson(skill);
  lines.push(`// --- JSON Schema ---`);
  lines.push(`export const ${toUpperSnake(skill.toolName)}_SCHEMA_JSON = ${JSON.stringify(schemaJson)};`);
  lines.push(``);

  // --- Zod schema ---
  const zodSchema = buildZodSchema(skill);
  lines.push(`// --- Zod Schema ---`);
  lines.push(`export const ${camelCase(skill.toolName)}_inputSchema = ${zodSchema};`);
  lines.push(``);

  // --- Tool Definition ---
  lines.push(`// --- Tool Definition ---`);
  lines.push(`export const ${skill.toolName}_TOOL: Tool<typeof ${camelCase(skill.toolName)}_inputSchema> = {`);
  lines.push(`  name: "${skill.toolName}",`);
  lines.push(`  description: \`${escapeBackticks(skill.description)}\`,`);
  lines.push(`  inputSchema: {`);
  lines.push(`    type: "object",`);
  lines.push(`    properties: ${JSON.stringify(schemaJson.properties, null, 4).replace(/\n/g, "\n    ")},`);

  const required = schemaJson.required ?? [];
  lines.push(`    required: ${JSON.stringify(required)},`);
  lines.push(`  },`);
  lines.push(`  async execute(args, _context) {`);

  // Harness validation
  if (skill.harness && skill.harness.length > 0) {
    lines.push(`    // Harness validation`);
    for (const rule of skill.harness) {
      lines.push(...generateHarnessRule(rule));
    }
    lines.push(``);
  }

  // Handler logic
  if (skill.handler) {
    lines.push(`    try {`);
    lines.push(`      // User-provided handler`);
    const handlerLines = skill.handler.trim().split("\n");
    for (const l of handlerLines) {
      lines.push(`      ${l}`);
    }
    lines.push(`    } catch (error) {`);
    lines.push(`      const message = error instanceof Error ? error.message : String(error);`);
    lines.push(`      return { result: { error: message }, format: "json" as const };`);
    lines.push(`    }`);
  } else {
    // Default handler
    lines.push(`    try {`);
    lines.push(`      // TODO: 实现 ${skill.name} 逻辑`);
    lines.push(`      return { result: { message: "Skill '${skill.name}' executed successfully" }, format: "json" as const };`);
    lines.push(`    } catch (error) {`);
    lines.push(`      const message = error instanceof Error ? error.message : String(error);`);
    lines.push(`      return { result: { error: message }, format: "json" as const };`);
    lines.push(`    }`);
  }

  lines.push(`  },`);
  lines.push(`};`);
  lines.push(``);

  return lines.join("\n");
}

function buildSchemaJson(skill: LIASSkill): { properties: Record<string, JSONSchemaProperty>; required: string[] } {
  return {
    properties: skill.inputSchema.properties ?? {},
    required: skill.inputSchema.required ?? [],
  };
}

function buildZodSchema(skill: LIASSkill): string {
  const parts: string[] = [];
  const required = new Set(skill.inputSchema.required ?? []);

  for (const [field, prop] of Object.entries(skill.inputSchema.properties)) {
    const base = `z.${prop.type}()`;
    let part = base;

    if (prop.description) {
      part += `.describe(${JSON.stringify(prop.description)})`;
    }
    if (prop.enum && prop.enum.length > 0) {
      part = `z.enum(${JSON.stringify(prop.enum)})`;
      if (prop.description) {
        part += `.describe(${JSON.stringify(prop.description)})`;
      }
    }
    if (prop.default !== undefined) {
      part += `.default(${JSON.stringify(prop.default)})`;
    }
    if (!required.has(field)) {
      part += `.optional()`;
    }

    parts.push(`${field}: ${part}`);
  }

  if (parts.length === 0) {
    return "z.object({})";
  }

  return `z.object({\n    ${parts.join(",\n    ")}\n  })`;
}

function generateHarnessRule(rule: { type: string; field: string; value?: unknown; message?: string }): string[] {
  const lines: string[] = [];
  const msg = rule.message ? JSON.stringify(rule.message) : `"Invalid value for field '${rule.field}'"`;

  switch (rule.type) {
    case "required":
      lines.push(`    if (args.${rule.field} === undefined || args.${rule.field} === null) {`);
      lines.push(`      throw new Error(${msg});`);
      lines.push(`    }`);
      break;
    case "range": {
      const [min, max] = Array.isArray(rule.value) ? rule.value : [0, Infinity];
      lines.push(`    if (typeof args.${rule.field} === "number") {`);
      if (min !== undefined) {
        lines.push(`      if (args.${rule.field} < ${min}) throw new Error("Value too small: " + ${msg});`);
      }
      if (max !== undefined) {
        lines.push(`      if (args.${rule.field} > ${max}) throw new Error("Value too large: " + ${msg});`);
      }
      lines.push(`    }`);
      break;
    }
    case "length":
      lines.push(`    if (typeof args.${rule.field} === "string") {`);
      lines.push(`      const len = args.${rule.field}.length;`);
      if (rule.value !== undefined) {
        lines.push(`      if (len > ${rule.value}) throw new Error("Length exceeds limit: " + ${msg});`);
      }
      lines.push(`    }`);
      break;
    case "pattern":
      lines.push(`    if (typeof args.${rule.field} === "string") {`);
      lines.push(`      const re = new RegExp(${JSON.stringify(String(rule.value))});`);
      lines.push(`      if (!re.test(args.${rule.field})) throw new Error("Pattern mismatch: " + ${msg});`);
      lines.push(`    }`);
      break;
    case "custom":
      lines.push(`    // Custom harness rule for '${rule.field}': ${JSON.stringify(rule.value)}`);
      break;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 9. skills/index.ts
// ---------------------------------------------------------------------------

function generateSkillIndex(skills: LIASSkill[]): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Skills Index`);
  lines.push(` * 自动生成，所有可用技能汇总`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`// Auto-generated by agent-forge`);
  lines.push(`import type { Tool } from "@anthropic/sdk";`);
  lines.push(``);

  // 导入每个 skill 的 TOOL
  for (const skill of skills) {
    lines.push(`import { ${skill.toolName}_TOOL } from "./${skill.name}.js";`);
  }
  lines.push(``);

  // 导出 allTools 数组
  lines.push(`export const allTools: Tool[] = [`);
  for (const skill of skills) {
    lines.push(`  ${skill.toolName}_TOOL,`);
  }
  lines.push(`];`);
  lines.push(``);

  // 导出单独的 TOOL 常量（方便按需引用）
  lines.push(`// Named exports for individual tools`);
  for (const skill of skills) {
    lines.push(`export { ${skill.toolName}_TOOL } from "./${skill.name}.js";`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 字符串工具
// ---------------------------------------------------------------------------

/**
 * snake_case → camelCase
 */
function camelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * snake_case → UPPER_SNAKE_CASE
 */
function toUpperSnake(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => `_${c.toUpperCase()}`).toUpperCase();
}

/**
 * 转义模板字符串中的反引号和 ${}
 */
function escapeBackticks(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

// ---------------------------------------------------------------------------
// 10. SKILL.md 生成（GeneratedSkill → .claude/skills/{name}/SKILL.md）
// ---------------------------------------------------------------------------

/**
 * 生成 Agent 级别的 SKILL.md（当没有 per-capability generatedSkills 时使用）
 */
function generateAgentSkillMd(ir: LIASManifest): string {
  const frontmatter: Record<string, unknown> = {
    name: ir.metadata.id,
    description: ir.metadata.description,
  };
  if (ir.metadata.tags && ir.metadata.tags.length > 0) {
    frontmatter.metadata = { tags: ir.metadata.tags.join(" ") };
  }
  frontmatter["allowed-tools"] = "Read Glob Grep Write Edit Bash";

  const fm = yaml.dump(frontmatter, { quotingType: '"', lineWidth: -1 }).trim();

  return `---\n${fm}\n---\n\n# ${ir.metadata.name}\n\n${generateSystemMd(ir)}\n\n${generateSafetyMd(ir)}`;
}

/**
 * generate-runtime.ts — 为 Agent 生成 LIAS 运行时文件
 *
 * 根据 LIAS 规范（BAIZE-AGENT-SPEC v3.1.0）为 Agent 目录生成：
 * - main.ts
 * - src/types.ts
 * - src/loop.ts
 * - src/provider.ts
 * - package.json
 * - tsconfig.json
 *
 * 使用方法:
 *   npx tsx scripts/generate-runtime.ts --input /path/to/agent [--dry-run]
 *   npx tsx scripts/generate-runtime.ts --batch /path/to/agency-agents --dry-run
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface CliOpts {
  input: string;
  batch?: boolean;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const opts: CliOpts = { input: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--input" || a === "-i") { opts.input = args[++i] ?? ""; }
    else if (a === "--batch" || a === "-b") { opts.batch = true; }
    else if (a === "--dry-run") { opts.dryRun = true; }
    else if (a === "--force") { opts.force = true; }
    else if (a === "--verbose" || a === "-v") { opts.verbose = true; }
  }
  if (!opts.input) {
    console.error("用法: tsx scripts/generate-runtime.ts --input <path> [--batch] [--dry-run] [--force] [-v]");
    process.exit(1);
  }
  return opts;
}

// ── 模板文件 ─────────────────────────────────────────

function generatePackageJson(agentId: string, description: string): string {
  return JSON.stringify({
    name: agentId,
    version: "1.0.0",
    description: description || `${agentId} - LIAS Agent`,
    type: "module",
    main: "main.js",
    scripts: {
      build: "tsc",
      start: "node main.js",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      "@anthropic/sdk": "^0.52.0",
      "@baize-loop/sdk": "^1.0.0",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      typescript: "^5.7.0",
    },
  }, null, 2) + "\n";
}

function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022"],
      outDir: "dist",
      rootDir: ".",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
    },
    include: ["src/**/*", "skills/**/*", "main.ts"],
    exclude: ["node_modules", "dist"],
  }, null, 2) + "\n";
}

function generateTypesTs(): string {
  return `import type { Tool, ToolUseContext } from "@anthropic/sdk";

export interface AgentState {
  input: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  iterations: number;
  maxIterations: number;
}

export interface FormattedResult {
  result: unknown;
  format: "json" | "text" | "markdown";
}

export async function loadPrompts(filename: string): Promise<string> {
  const nodePath = await import("node:path");
  const nodeFs = await import("node:fs");
  const promptsDir = nodePath.join(import.meta.dirname, "..", "prompts");
  try {
    return nodeFs.readFileSync(nodePath.join(promptsDir, filename), "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error("加载 prompt 文件 \"" + filename + "\" 失败: " + msg);
  }
}

export type { Tool, ToolUseContext };
`;
}

function generateProviderTs(provider: { type?: string; model?: string; apiKeyEnvVar?: string } = {}): string {
  const ptype = provider.type ?? "claude";
  const pmodel = provider.model ?? "claude-sonnet-4-20250514";
  const pkey = provider.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";

  return `import { createProvider } from "@baize-loop/sdk";

export const provider = createProvider({
  type: "${ptype}",
  model: "${pmodel}",
  apiKey: process.env.${pkey},
});

export const llm = provider.createClient();
`;
}

function generateLoopTs(): string {
  return `import type { ToolUseContext } from "@anthropic/sdk";
import { allTools } from "../skills/index.js";
import { llm } from "./provider.js";
import { loadPrompts } from "./types.js";

const SYSTEM = await loadPrompts("system.md");
const SAFETY = await loadPrompts("safety.md");

async function step(input: string, context: ToolUseContext): Promise<string> {
  const prompt = \`\${SYSTEM}

\${SAFETY}

## Input
\${input}\`;

  const response = await llm.chat(prompt, allTools, {
    maxTokens: 8192,
    temperature: 0.3,
  });

  if (response.type === "text") return response.content;

  if (response.type === "tool_use") {
    const toolName = response.name;
    const args = response.input;
    const tool = allTools.find((t) => t.name === toolName);
    if (!tool) return \`错误: 未找到工具 '\${toolName}'\`;

    try {
      const execResult = await tool.execute(args as never, context);
      const toolOutput = typeof execResult === "string"
        ? execResult
        : JSON.stringify(execResult);
      return await step(\`工具 '\${toolName}' 返回: \${toolOutput}\`, context);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return \`工具 '\${toolName}' 执行失败: \${errMsg}\`;
    }
  }

  return "Agent 未能产生有效响应";
}

export async function run(input: string, context: ToolUseContext): Promise<string> {
  let iterations = 0;
  const maxIterations = 10;
  let currentInput = input;

  while (iterations < maxIterations) {
    iterations++;
    const result = await step(currentInput, context);
    if (!result.includes("tool_use")) return result;
    currentInput = result;
  }

  return \`Agent 在 \${maxIterations} 次迭代后未能完成\`;
}
`;
}

function generateMainTs(): string {
  return `import { run } from "./src/loop.js";
import type { ToolUseContext } from "@anthropic/sdk";

export async function agent(input: string, context: ToolUseContext): Promise<string> {
  return run(input, context);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("用法: node main.js <task>");
    process.exit(1);
  }
  const input = args.join(" ");
  const context = {} as ToolUseContext;
  const result = await agent(input, context);
  console.log(result);
}

main().catch((err) => {
  console.error("Agent 运行失败:", err);
  process.exit(1);
});
`;
}

function generateSkillsIndex(): string {
  return `/**
 * Skills Index — 导出所有 Skill 工具
 * LIAS 运行时 Skill 定义
 */

import type { Tool } from "@anthropic/sdk";

// 添加工具时，在此注册
export const allTools: Tool[] = [];

// 示例工具注册:
// import { fetchDataTool } from "./fetch-data.js";
// allTools.push(fetchDataTool);
`;
}

// ── 解析 Agent 信息 ─────────────────────────────────

async function parseAgentInfo(agentDir: string): Promise<{ id: string; name: string; description: string; provider?: { type?: string; model?: string; apiKeyEnvVar?: string } }> {
  // 优先读取 AGENT.md
  const agentMdPath = path.join(agentDir, "AGENT.md");
  if (fs.existsSync(agentMdPath)) {
    try {
      const content = fs.readFileSync(agentMdPath, "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const lines = fmMatch[1].split("\n");
        const fm: Record<string, string> = {};
        for (const line of lines) {
          const m = line.match(/^(\w+):\s*(.*)$/);
          if (m) fm[m[1]] = m[2].trim();
        }
        return {
          id: fm.id || path.basename(agentDir),
          name: fm.name || path.basename(agentDir),
          description: fm.description || "",
        };
      }
    } catch {}
  }

  // 回退到 agent.yaml
  const agentYamlPath = path.join(agentDir, "agent.yaml");
  if (fs.existsSync(agentYamlPath)) {
    try {
      const yaml = await import("js-yaml");
      const data = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
      const meta = (data.metadata ?? data) as Record<string, unknown>;
      return {
        id: String(meta.id ?? path.basename(agentDir)),
        name: String(meta.name ?? path.basename(agentDir)),
        description: String(meta.description ?? ""),
        provider: data.provider as { type?: string; model?: string; apiKeyEnvVar?: string } | undefined,
      };
    } catch {}
  }

  return {
    id: path.basename(agentDir),
    name: path.basename(agentDir),
    description: "",
  };
}

// ── 主逻辑 ─────────────────────────────────────────

async function generateRuntimeForAgent(agentDir: string, dryRun = false, force = false): Promise<{ fixed: number; skipped: number; errors: string[] }> {
  let fixed = 0, skipped = 0;
  const errors: string[] = [];

  const info = await parseAgentInfo(agentDir);

  const files: Array<{ rel: string; content: string }> = [
    { rel: "package.json", content: generatePackageJson(info.id, info.description) },
    { rel: "tsconfig.json", content: generateTsConfig() },
    { rel: "main.ts", content: generateMainTs() },
    { rel: path.join("src", "types.ts"), content: generateTypesTs() },
    { rel: path.join("src", "provider.ts"), content: generateProviderTs(info.provider) },
    { rel: path.join("src", "loop.ts"), content: generateLoopTs() },
    { rel: path.join("skills", "index.ts"), content: generateSkillsIndex() },
  ];

  for (const f of files) {
    const filePath = path.join(agentDir, f.rel);
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      if (!dryRun) fs.mkdirSync(dirPath, { recursive: true });
    }

    if (fs.existsSync(filePath) && !force && !dryRun) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        fs.writeFileSync(filePath, f.content, "utf-8");
        fixed++;
      } catch (e) {
        errors.push(`写入失败 ${f.rel}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      fixed++;
    }
  }

  return { fixed, skipped, errors };
}

async function main() {
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 路径不存在: ${inputPath}`);
    process.exit(1);
  }

  // 收集所有 Agent 目录
  const agentDirs: string[] = [];

  if (opts.batch) {
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(inputPath, entry.name);
        if (fs.existsSync(path.join(subPath, "prompts")) ||
            fs.existsSync(path.join(subPath, "AGENT.md")) ||
            fs.existsSync(path.join(subPath, "agent.yaml"))) {
          agentDirs.push(subPath);
        } else {
          // 二级目录
          let subEntries: fs.Dirent[] = [];
          try { subEntries = fs.readdirSync(subPath, { withFileTypes: true }); } catch { continue; }
          for (const se of subEntries) {
            if (se.isDirectory()) {
              const agentPath = path.join(subPath, se.name);
              if (fs.existsSync(path.join(agentPath, "prompts")) ||
                  fs.existsSync(path.join(agentPath, "AGENT.md")) ||
                  fs.existsSync(path.join(agentPath, "agent.yaml"))) {
                agentDirs.push(agentPath);
              }
            }
          }
        }
      }
    }
  } else {
    agentDirs.push(inputPath);
  }

  console.log(`🔧 LIAS 运行时生成`);
  console.log(`   输入路径: ${inputPath}`);
  console.log(`   目标 Agent: ${agentDirs.length} 个`);
  console.log(`   模式: ${opts.dryRun ? "dry-run（不写入）" : "实际生成"}${opts.force ? "（强制覆盖）" : ""}`);
  console.log("");

  let totalFixed = 0, totalSkipped = 0;
  const allErrors: string[] = [];

  const results = await Promise.all(agentDirs.map(agentDir => generateRuntimeForAgent(agentDir, opts.dryRun, opts.force)));
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    totalFixed += result.fixed;
    totalSkipped += result.skipped;
    allErrors.push(...result.errors);

    if (opts.verbose) {
      console.log(`  ${path.basename(agentDirs[i])}: +${result.fixed} 生成, ${result.skipped} 跳过`);
    }
  }

  console.log(`📊 生成结果:`);
  console.log(`   生成文件: ${totalFixed}`);
  console.log(`   跳过（已存在）: ${totalSkipped}`);
  if (allErrors.length > 0) {
    console.log(`   错误: ${allErrors.length}`);
    for (const e of allErrors.slice(0, 5)) {
      console.log(`     - ${e}`);
    }
  }

  if (opts.dryRun) {
    console.log("\n💡 这是 dry-run 模式，未实际写入任何文件");
    console.log("   移除 --dry-run 标志以执行实际生成");
  } else if (totalFixed > 0) {
    console.log(`\n✅ 生成完成: ${totalFixed} 个文件`);
  }
}

main().catch((e) => {
  console.error("❌ 生成失败:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

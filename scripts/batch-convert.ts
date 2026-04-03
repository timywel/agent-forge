#!/usr/bin/env node
/**
 * 批量转换 agency-agents 到 LIAS 格式
 * 保持分类目录结构
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { convert } from "../src/converter/index.js";
import { detectFormat } from "../src/converter/detector.js";
import { DEFAULT_FORGE_CONFIG } from "../src/types/common.js";

const SOURCE_DIR = "/home/timywel/文档/obsidian/Wel的AI工坊/03_Resources-资源/11_agent/agency-agents";
const OUTPUT_DIR = "/home/timywel/AI_Product/规范/test";

// 排除的目录（不包含 Agent）
const EXCLUDED_DIRS = new Set([
  "examples", "scripts", "converted-agents", "strategy",
]);

// 要跳过的文件（README 等）
const EXCLUDED_FILES = new Set([
  "README.md", "ANALYSIS.md", "CONTRIBUTING.md", "CONTRIBUTING_zh-CN.md", "LICENSE",
]);

interface AgentInfo {
  absPath: string;
  relPath: string;        // 相对于 agency-agents 的路径
  category: string;        // 分类目录名
  fileName: string;        // 文件名不含扩展名
  outDir: string;          // 输出目录
}

function findAllAgents(sourceDir: string): AgentInfo[] {
  const agents: AgentInfo[] = [];

  // 排除的顶级目录（不视为 Agent 分类）
  const SKIP_TOP_DIRS = new Set([
    "examples", "scripts", "converted-agents", "strategy",
    "node_modules", ".git",
  ]);

  function scan(dir: string, currentCategory?: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith(".md") && !EXCLUDED_FILES.has(entry.name)) {
        // 找到 Agent 文件
        const mdFile = entry.name;
        const relPath = path.relative(SOURCE_DIR, fullPath);

        // 确定分类：从路径中找第一个非排除的顶级目录
        let category = currentCategory ?? "unknown";
        if (!currentCategory) {
          const parts = path.relative(SOURCE_DIR, fullPath).split(path.sep);
          for (const part of parts) {
            if (SKIP_TOP_DIRS.has(part)) continue;
            // 找到第一个非排除的目录，作为 category
            category = part;
            break;
          }
        }

        const outDir = path.join(OUTPUT_DIR, category, mdFile.replace(/\.md$/, ""));
        agents.push({
          absPath: fullPath,
          relPath,
          category,
          fileName: mdFile.replace(/\.md$/, ""),
          outDir,
        });
      } else if (entry.isDirectory()) {
        // 排除特定目录
        if (SKIP_TOP_DIRS.has(entry.name)) continue;
        // 传递当前 category（如果已确定），否则在下一层确定
        scan(fullPath, currentCategory);
      }
    }
  }

  scan(sourceDir);
  return agents;
}

async function main() {
  console.log("🔍 扫描 Agent 文件...\n");
  const agents = findAllAgents(SOURCE_DIR);
  console.log(`找到 ${agents.length} 个 Agent\n`);

  let success = 0;
  let failed = 0;
  const errors: Array<{ agent: string; error: string }> = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const num = `[${i + 1}/${agents.length}]`;

    // 检测格式
    const format = detectFormat(agent.absPath);
    if (format === "unknown") {
      console.log(`${num} ⏭️  跳过（无法识别格式）: ${agent.relPath}`);
      failed++;
      continue;
    }

    // 确保输出目录存在
    fs.mkdirSync(agent.outDir, { recursive: true });

    const config = {
      ...DEFAULT_FORGE_CONFIG,
      llm: {
        ...DEFAULT_FORGE_CONFIG.llm,
        baseUrl: process.env.LLM_URL ?? DEFAULT_FORGE_CONFIG.llm.baseUrl,
        model: process.env.LLM_MODEL ?? DEFAULT_FORGE_CONFIG.llm.model,
      },
      verbose: false,
      dryRun: false,
    };

    try {
      const result = await convert({
        input: agent.absPath,
        output: agent.outDir,
        skipValidation: true,
        config,
      });

      if (result.success) {
        const errors_count = result.validation?.errors.length ?? 0;
        const warnings_count = result.validation?.warnings.length ?? 0;
        const status = errors_count > 0 ? "⚠️" : "✅";
        console.log(`${num} ${status} ${agent.category}/${agent.fileName} (${result.sourceFormat}) — ${result.filesGenerated.length} 文件`);
        if (warnings_count > 0) console.log(`         警告: ${warnings_count}`);
        success++;
      } else {
        console.log(`${num} ❌ ${agent.category}/${agent.fileName}: ${result.errors?.join(", ")}`);
        errors.push({ agent: agent.relPath, error: result.errors?.join(", ") ?? "unknown" });
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${num} ❌ ${agent.category}/${agent.fileName}: ${msg}`);
      errors.push({ agent: agent.relPath, error: msg });
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`总计: ${agents.length} | ✅ 成功: ${success} | ❌ 失败: ${failed}`);
  if (errors.length > 0) {
    console.log(`\n失败详情:`);
    for (const e of errors) {
      console.log(`  ${e.agent}: ${e.error}`);
    }
  }
}

main().catch(console.error);

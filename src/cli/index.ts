#!/usr/bin/env node
/**
 * agent-forge CLI
 * LIAS（Lightweight Industrial Agent Specification）Agent 工具链
 * Validator + Converter + Optimizer
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import { validate, formatReport } from "../validator/index.js";
import { convert, detectFormat, formatLabel } from "../converter/index.js";
import { analyze, optimize, formatOptimizeReport } from "../optimizer/index.js";
import { DEFAULT_FORGE_CONFIG } from "../types/common.js";
import { migrate } from "./migrate.js";

const program = new Command();

program
  .name("agent-forge")
  .description("LIAS Agent 工具链：Validator + Converter + Optimizer")
  .version("2.0.0");

// ════════════════════════════════════════
// validate — 验证 Agent 目录
// ════════════════════════════════════════
program
  .command("validate")
  .description("验证 Agent 目录是否符合 LIAS 规范")
  .requiredOption("-i, --input <path>", "Agent 目录路径")
  .option("-v, --verbose", "详细输出")
  .action((opts) => {
    const result = validate(opts.input);
    console.log(formatReport(result));
    process.exit(result.passed ? 0 : 1);
  });

// ════════════════════════════════════════
// convert — 转换为 LIAS 标准格式
// ════════════════════════════════════════
program
  .command("convert")
  .description("将各种格式转换为 LIAS（Lightweight Industrial Agent Specification）标准 TypeScript Agent 项目")
  .requiredOption("-i, --input <path>", "输入文件/目录路径")
  .requiredOption("-o, --output <dir>", "输出目录路径")
  .option("-f, --format <format>", "强制指定输入格式（跳过自动检测）")
  .option("--dry-run", "仅预览，不实际生成文件")
  .option("--skip-validation", "跳过生成后验证")
  .option("--llm-url <url>", "LLM 代理地址", DEFAULT_FORGE_CONFIG.llm.baseUrl)
  .option("--model <model>", "LLM 模型", DEFAULT_FORGE_CONFIG.llm.model)
  .option("-v, --verbose", "详细输出")
  .action(async (opts) => {
    const config = {
      ...DEFAULT_FORGE_CONFIG,
      llm: {
        ...DEFAULT_FORGE_CONFIG.llm,
        baseUrl: opts.llmUrl,
        model: opts.model,
      },
      verbose: !!opts.verbose,
      dryRun: !!opts.dryRun,
    };

    const result = await convert({
      input: opts.input,
      output: opts.output,
      format: opts.format,
      skipValidation: opts.skipValidation,
      config,
    });

    if (result.success) {
      console.log(`✅ 转换完成: ${result.outputDir}`);
      console.log(`   源格式: ${formatLabel(result.sourceFormat)}`);
      console.log(`   生成文件: ${result.filesGenerated.length}`);
      for (const f of result.filesGenerated) {
        console.log(`   - ${f}`);
      }

      if (result.validation) {
        console.log("");
        console.log(formatReport(result.validation));
      }
    } else {
      console.error(`❌ 转换失败:`);
      for (const err of result.errors ?? []) {
        console.error(`   ${err}`);
      }
      process.exit(1);
    }
  });

// ════════════════════════════════════════
// create — 从自然语言创建 LIAS Agent
// ════════════════════════════════════════
program
  .command("create")
  .description("从自然语言描述创建 LIAS TypeScript Agent 项目")
  .requiredOption("-i, --input <text>", "自然语言描述（或文件路径）")
  .requiredOption("-o, --output <dir>", "输出目录路径")
  .option("--llm-url <url>", "LLM 代理地址", DEFAULT_FORGE_CONFIG.llm.baseUrl)
  .option("--model <model>", "LLM 模型", DEFAULT_FORGE_CONFIG.llm.model)
  .option("-v, --verbose", "详细输出")
  .action(async (opts) => {
    const config = {
      ...DEFAULT_FORGE_CONFIG,
      llm: {
        ...DEFAULT_FORGE_CONFIG.llm,
        baseUrl: opts.llmUrl,
        model: opts.model,
      },
      verbose: !!opts.verbose,
      dryRun: false,
    };

    const result = await convert({
      input: opts.input,
      output: opts.output,
      format: "natural-lang",
      config,
    });

    if (result.success) {
      console.log(`✅ Agent 创建完成: ${result.outputDir}`);
      for (const f of result.filesGenerated) {
        console.log(`   - ${f}`);
      }
    } else {
      console.error(`❌ 创建失败:`);
      for (const err of result.errors ?? []) {
        console.error(`   ${err}`);
      }
      process.exit(1);
    }
  });

// ════════════════════════════════════════
// analyze — 仅分析质量（不修改）
// ════════════════════════════════════════
program
  .command("analyze")
  .description("分析 LIAS Agent 质量评分")
  .requiredOption("-i, --input <path>", "Agent 目录路径")
  .action((opts) => {
    const result = analyze(opts.input);
    console.log(`📊 Agent 质量分析: ${opts.input}`);
    console.log("");
    console.log(`总评分: ${result.score.overall}/100`);
    console.log(`  身份定义 (Identity): ${result.score.identity}/100`);
    console.log(`  Skill 质量 (Skills): ${result.score.skills}/100`);
    console.log(`  安全红线 (Safety): ${result.score.safety}/100`);
    console.log(`  运行时 (Runtime): ${result.score.runtime}/100`);
    console.log(`  完整性 (Completeness): ${result.score.completeness}/100`);

    if (result.improvements.length > 0) {
      console.log("");
      console.log(`改进建议 (${result.improvements.length}):`);
      for (const imp of result.improvements) {
        const icon = imp.severity === "error" ? "❌" : imp.severity === "warning" ? "⚠️" : "ℹ️";
        console.log(`  ${icon} [${imp.category}] ${imp.description}`);
      }
    }
  });

// ════════════════════════════════════════
// optimize — 分析 + 优化
// ════════════════════════════════════════
program
  .command("optimize")
  .description("分析并优化 LIAS Agent 质量")
  .requiredOption("-i, --input <path>", "Agent 目录路径")
  .option("--no-auto-fix", "不自动修复")
  .option("--use-llm", "使用 LLM 进行深度优化")
  .option("--llm-url <url>", "LLM 代理地址", DEFAULT_FORGE_CONFIG.llm.baseUrl)
  .option("--model <model>", "LLM 模型", DEFAULT_FORGE_CONFIG.llm.model)
  .option("-v, --verbose", "详细输出")
  .action(async (opts) => {
    const config = {
      ...DEFAULT_FORGE_CONFIG,
      llm: {
        ...DEFAULT_FORGE_CONFIG.llm,
        baseUrl: opts.llmUrl,
        model: opts.model,
      },
      verbose: !!opts.verbose,
      dryRun: false,
    };

    const result = await optimize({
      agentDir: opts.input,
      autoFix: opts.autoFix !== false,
      useLLM: !!opts.useLlm,
      config,
    });

    console.log(formatOptimizeReport(result));
  });

// ════════════════════════════════════════
// detect — 检测格式
// ════════════════════════════════════════
program
  .command("detect")
  .description("检测输入文件/目录的 Agent 格式")
  .requiredOption("-i, --input <path>", "输入文件/目录路径")
  .action((opts) => {
    const format = detectFormat(opts.input);
    console.log(`格式: ${formatLabel(format)} (${format})`);
  });

// ════════════════════════════════════════
// migrate — agent.yaml → AGENT.md 迁移
// ════════════════════════════════════════
program
  .command("migrate")
  .description("将 agent.yaml 迁移为 AGENT.md 格式")
  .requiredOption("-i, --input <path>", "Agent 目录路径（或包含多个 agent 的父目录）")
  .option("--delete", "迁移后删除原始 agent.yaml")
  .option("--batch", "批量模式：处理 input 目录下的所有子目录")
  .option("-v, --verbose", "详细输出")
  .action((opts) => {
    const { input, delete: shouldDelete, batch, verbose } = opts;

    if (batch) {
      // 批量模式：遍历所有子目录
      const entries = fs.readdirSync(input, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => path.join(input, e.name));
      console.log(`批量迁移: ${dirs.length} 个目录`);
      console.log("");

      let success = 0;
      let failed = 0;

      for (const dir of dirs) {
        const agentYamlPath = path.join(dir, "agent.yaml");
        if (!fs.existsSync(agentYamlPath)) {
          if (verbose) console.log(`  跳过 (无 agent.yaml): ${dir}`);
          continue;
        }
        process.stdout.write(`  ${path.basename(dir)}... `);
        const result = migrate({ input: dir, delete: shouldDelete, verbose: !!verbose });
        if (result.success) {
          console.log("✅");
          if (verbose && result.warnings.length > 0) {
            for (const w of result.warnings) console.log(`    ⚠️ ${w}`);
          }
          success++;
        } else {
          console.log("❌");
          for (const e of result.errors) console.log(`    ❌ ${e}`);
          failed++;
        }
      }

      console.log("");
      console.log(`完成: ${success} 成功, ${failed} 失败`);
    } else {
      // 单个目录模式
      const result = migrate({ input, delete: shouldDelete, verbose: !!verbose });

      if (result.success) {
        console.log(`✅ 迁移完成: ${result.output}`);
        if (result.deleted) {
          console.log(`   已删除: ${result.deleted}`);
        }
        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            console.log(`⚠️  ${w}`);
          }
        }
      } else {
        console.error(`❌ 迁移失败:`);
        for (const e of result.errors) {
          console.error(`   ${e}`);
        }
        process.exit(1);
      }
    }
  });

// ════════════════════════════════════════
// formats — 显示支持的格式
// ════════════════════════════════════════
program
  .command("formats")
  .description("显示所有支持的输入格式")
  .action(() => {
    console.log("支持的输入格式:");
    console.log("");
    console.log("  LIAS           LIAS（完整 TypeScript Agent 项目）");
    console.log("  LIAS-minimal   LIAS-minimal（简化版）");
    console.log("  LA             Lightweight Agent（BaizeAgent v2 格式）");
    console.log("  agent-md       .agent.md（含 YAML Frontmatter）");
    console.log("  Workflow       多步工作流 YAML 文件");
    console.log("  Plugin         Claude Plugin YAML 文件");
    console.log("  自然语言       纯文本描述（需要 LLM）");
    console.log("  OpenAPI        OpenAPI/Swagger JSON/YAML");
    console.log("  MCP            MCP Server 定义 JSON/YAML");
  });

program.parse();

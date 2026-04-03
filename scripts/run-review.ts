/**
 * agent-forge review — 评审团入口脚本
 *
 * 使用方法:
 *   npx tsx scripts/run-review.ts --input <path> [--top N] [--bottom N] [--output <dir>] [-v]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { runReviewBoard, saveReport } from "../src/reviewer/ReviewBoard.js";
import type { ReviewConfig } from "../src/types/review.js";

interface CliOpts {
  input: string;
  top?: number;
  bottom?: number;
  output?: string;
  verbose?: boolean;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const opts: CliOpts = { input: "" };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" || arg === "-i") {
      opts.input = args[++i] ?? "";
    } else if (arg === "--top") {
      opts.top = parseInt(args[++i] ?? "5", 10);
    } else if (arg === "--bottom") {
      opts.bottom = parseInt(args[++i] ?? "10", 10);
    } else if (arg === "--output" || arg === "-o") {
      opts.output = args[++i] ?? "";
    } else if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
    }
  }

  if (!opts.input) {
    console.error("用法: tsx scripts/run-review.ts --input <path> [--top N] [--bottom N] [--output <dir>] [-v]");
    process.exit(1);
  }

  return opts;
}

function makeBar(score: number): string {
  const s = Math.max(0, Math.min(10, Math.round(score)));
  return "▓".repeat(s) + "░".repeat(10 - s);
}

async function main() {
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 路径不存在: ${inputPath}`);
    process.exit(1);
  }

  // 查找所有 Agent 目录
  const agentDirs: string[] = [];
  const stat = fs.statSync(inputPath);

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(inputPath, entry.name);
        if (fs.existsSync(path.join(subPath, "main.ts")) ||
            fs.existsSync(path.join(subPath, "prompts")) ||
            fs.existsSync(path.join(subPath, "AGENT.md")) ||
            fs.existsSync(path.join(subPath, "agent.yaml"))) {
          agentDirs.push(subPath);
        } else {
          // 分类目录（agency-agents/{category}/{agent}）
          let subEntries: fs.Dirent[] = [];
          try {
            subEntries = fs.readdirSync(subPath, { withFileTypes: true });
          } catch { continue; }
          for (const subEntry of subEntries) {
            if (subEntry.isDirectory()) {
              const agentPath = path.join(subPath, subEntry.name);
              if (fs.existsSync(path.join(agentPath, "main.ts")) ||
                  fs.existsSync(path.join(agentPath, "prompts")) ||
                  fs.existsSync(path.join(agentPath, "AGENT.md")) ||
                  fs.existsSync(path.join(agentPath, "agent.yaml"))) {
                agentDirs.push(agentPath);
              }
            }
          }
        }
      }
    }
  }

  if (agentDirs.length === 0) {
    console.error(`❌ 未找到 Agent 目录`);
    console.error(`   路径: ${inputPath}`);
    process.exit(1);
  }

  console.log(`🔍 Agent 评审团启动`);
  console.log(`   输入路径: ${inputPath}`);
  console.log(`   发现 Agent: ${agentDirs.length} 个`);
  console.log("");

  const config: ReviewConfig = {
    includeTopN: opts.top ?? 5,
    includeBottomN: opts.bottom ?? 10,
    outputDir: opts.output,
  };

  const report = await runReviewBoard(agentDirs, { config, verbose: opts.verbose ?? false });

  console.log(`📊 评审完成: ${report.totalAgents} 个 Agent`);
  console.log(`   平均评分: ${report.summary.avgScore}/10`);
  console.log(`   平均分（百分制）: ${report.summary.avgWeightedScore}/100`);
  console.log(`   问题总数: ${report.summary.totalIssues} (${report.summary.errors} 错误, ${report.summary.warnings} 警告, ${report.summary.infos} 提示)`);
  console.log("");

  // 输出 Top 5
  console.log(`🏆 Top ${report.topAgents.length}:`);
  for (const agent of report.topAgents) {
    console.log(`   ${agent.agentId}: ${makeBar(agent.overallScore)} ${agent.overallScore}/10`);
  }
  console.log("");

  // 输出 Bottom 10
  console.log(`⚠️  Bottom ${report.bottomAgents.length}:`);
  for (const agent of report.bottomAgents) {
    console.log(`   ${agent.agentId}: ${makeBar(agent.overallScore)} ${agent.overallScore}/10 (${agent.issues.length} 问题)`);
  }
  console.log("");

  // 保存报告
  const reportsDir = opts.output || path.join(path.dirname(inputPath), "reports");
  await saveReport(report, reportsDir);
}

main().catch((e) => {
  console.error("❌ 评审失败:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  process.exit(1);
});

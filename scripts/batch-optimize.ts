/**
 * batch-optimize.ts — 批量优化 Agent（基于评审报告）
 *
 * 读取 JSON 报告，自动修复可自动修复的问题
 * 对于需要人工判断的问题，输出优化建议
 *
 * 使用方法:
 *   npx tsx scripts/batch-optimize.ts --input reports/agent-review-report-2026-04-03.json [--dry-run] [--category <name>]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

interface CliOpts {
  input: string;
  dryRun?: boolean;
  force?: boolean;
  category?: string;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const opts: CliOpts = { input: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--input" || a === "-i") { opts.input = args[++i] ?? ""; }
    else if (a === "--dry-run") { opts.dryRun = true; }
    else if (a === "--force") { opts.force = true; }
    else if (a === "--category" || a === "-c") { opts.category = args[++i] ?? ""; }
  }
  if (!opts.input) {
    console.error("用法: tsx scripts/batch-optimize.ts --input <report.json> [--dry-run] [--force] [--category <name>]");
    process.exit(1);
  }
  return opts;
}

// ── 可自动修复的优化 ───────────────────────────────

/**
 * 优化 1: 补全 AGENT.md 的 domain.primary
 * 从目录路径提取 domain，自动写入 frontmatter
 */
function fixDomainPrimary(agentPath: string, dryRun?: boolean): { fixed: number; skipped: number } {
  let fixed = 0, skipped = 0;
  const agentMdPath = path.join(agentPath, "AGENT.md");
  if (!fs.existsSync(agentMdPath)) { skipped++; return { fixed, skipped }; }

  const parts = agentPath.split(path.sep);
  // 优先从 agency-agents/{category}/ 提取，否则取父目录名
  const agencyIdx = parts.findIndex(p => p === "agency-agents");
  let catDir = "";
  if (agencyIdx >= 0 && agencyIdx + 1 < parts.length) {
    catDir = parts[agencyIdx + 1];
  } else {
    // 提取父目录名（/tmp/agent-review/{category}/{agent}/）
    // parts: [..., "tmp", "agent-review", "academic", "academic-anthropologist"]
    // 取倒数第二层
    catDir = parts[parts.length - 2] ?? "";
  }

  const domainMap: Record<string, string> = {
    academic: "academic", design: "design", engineering: "engineering",
    "game-development": "game-development", marketing: "marketing",
    "paid-media": "paid-media", product: "product",
    "project-management": "project-management", sales: "sales",
    "spatial-computing": "spatial-computing", specialized: "specialized",
    support: "support", testing: "testing",
  };

  const domain = domainMap[catDir] ?? catDir;
  let content = fs.readFileSync(agentMdPath, "utf-8");

  // 检查是否已有 domain.primary（非空值）
  // 逐行查找 "  primary:" 并检查后续内容是否为非空
  const primaryLineIdx = content.split("\n").findIndex(l => /^\s*primary:\s*/.test(l));
  if (primaryLineIdx >= 0) {
    const line = content.split("\n")[primaryLineIdx];
    const val = line.replace(/^\s*primary:\s*/, "").trim();
    if (val) { skipped++; return { fixed, skipped }; }
  }

  // 插入或替换 domain.primary
  const lines = content.split("\n");
  const insertIdx = lines.findIndex(l => /^author:/m.test(l));

  // 检查是否有空的 domain.primary 需要替换
  const emptyPrimaryIdx = lines.findIndex(l => /^\s*primary:\s*$/.test(l));

  if (emptyPrimaryIdx >= 0) {
    // 替换空值
    lines[emptyPrimaryIdx] = `  primary: ${domain}`;
    content = lines.join("\n");
    if (!dryRun) fs.writeFileSync(agentMdPath, content, "utf-8");
    fixed++;
  } else if (insertIdx >= 0) {
    // 检查是否已有 domain 行
    const hasDomain = lines.some(l => /^domain:/m.test(l));
    if (!hasDomain) {
      // 找到 frontmatter 结束位置（下一个 ---）
      const fmEndIdx = lines.findIndex((l, i) => i > insertIdx && l.trim() === "---");
      if (fmEndIdx >= 0) {
        lines.splice(fmEndIdx, 0, `domain:`, `  primary: ${domain}`);
      } else {
        lines.splice(insertIdx + 1, 0, `domain:`, `  primary: ${domain}`);
      }
      content = lines.join("\n");
      if (!dryRun) fs.writeFileSync(agentMdPath, content, "utf-8");
      fixed++;
    } else {
      skipped++;
    }
  } else {
    skipped++;
  }

  return { fixed, skipped };
}

/**
 * 优化 2: 修复 agent.yaml id 与目录名不一致
 * 将 id 改为与目录名一致
 */
function fixAgentIdConsistency(agentPath: string, dryRun?: boolean): { fixed: number; skipped: number } {
  let fixed = 0, skipped = 0;
  const agentYamlPath = path.join(agentPath, "agent.yaml");
  if (!fs.existsSync(agentYamlPath)) { skipped++; return { fixed, skipped }; }

  const dirName = path.basename(agentPath);
  const content = fs.readFileSync(agentYamlPath, "utf-8");

  let data: Record<string, unknown>;
  try {
    data = yaml.load(content) as Record<string, unknown>;
  } catch { skipped++; return { fixed, skipped }; }

  const meta = (data.metadata ?? data) as Record<string, unknown>;
  const yamlId = String(meta.id ?? "");

  // 目标 id：去除分类前缀
  let targetId = dirName;
  const prefixes = ["academic-", "design-", "engineering-", "game-", "marketing-", "support-", "paid-media-", "product-", "sales-", "spatial-", "specialized-", "testing-", "project-management-"];
  for (const prefix of prefixes) {
    if (targetId.startsWith(prefix)) {
      targetId = targetId.slice(prefix.length);
      break;
    }
  }

  if (yamlId !== targetId && yamlId !== dirName) {
    if (data.metadata) {
      (data.metadata as Record<string, unknown>).id = targetId;
    } else {
      data.id = targetId;
    }
    if (!dryRun) fs.writeFileSync(agentYamlPath, yaml.dump(data), "utf-8");
    fixed++;
  } else {
    skipped++;
  }

  return { fixed, skipped };
}

/**
 * 优化 3: 补全 prompts/safety.md
 * 生成标准安全红线文件
 */
function fixSafetyMd(agentPath: string, dryRun?: boolean): { fixed: number; skipped: number } {
  let fixed = 0, skipped = 0;
  const safetyPath = path.join(agentPath, "prompts", "safety.md");
  if (fs.existsSync(safetyPath)) { skipped++; return { fixed, skipped }; }

  const promptsDir = path.join(agentPath, "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });

  // 读取 system.md 获取角色名
  const systemPath = path.join(agentPath, "prompts", "system.md");
  let agentName = path.basename(agentPath);
  if (fs.existsSync(systemPath)) {
    const sys = fs.readFileSync(systemPath, "utf-8");
    const nameMatch = sys.match(/^#\s+(.+)/m);
    if (nameMatch) agentName = nameMatch[1].trim();
  }

  const safetyMd = [
    `# ${agentName} — Safety Rules`,
    ``,
    `## Prohibited Actions`,
    ``,
    `- 禁止访问未经授权的外部 API 或数据源`,
    `- 禁止修改或删除系统关键配置文件`,
    `- 禁止执行任何可能违反法律法规的操作`,
    `- 禁止在未经验证的情况下执行破坏性操作`,
    `- 禁止泄露用户敏感信息或商业机密`,
    ``,
    `## Constraints`,
    ``,
    `- 在执行任何关键操作前，必须获得用户明确确认`,
    `- 所有输出必须经过质量验证`,
    `- 如遇到不确定的情况，主动寻求澄清`,
    ``,
    `## Fallback Logic`,
    ``,
    `- 如果任务超出能力范围，明确告知用户并建议替代方案`,
    `- 如果无法安全执行操作，拒绝执行并说明原因`,
    `- 如果信息不完整，说明需要补充哪些信息`,
    `- 如果请求涉及敏感操作，要求用户提供额外的授权确认`,
  ].join("\n");

  if (dryRun) return { fixed: 0, skipped: 0 };
  fs.writeFileSync(safetyPath, safetyMd, "utf-8");
  fixed++;
  return { fixed, skipped };
}

/**
 * 优化 4: 补全 prompts/system.md 的 Identity 章节
 */
function fixSystemMdIdentity(agentPath: string, dryRun?: boolean): { fixed: number; skipped: number } {
  let fixed = 0, skipped = 0;
  const systemPath = path.join(agentPath, "prompts", "system.md");
  if (!fs.existsSync(systemPath)) { skipped++; return { fixed, skipped }; }

  let content = fs.readFileSync(systemPath, "utf-8");

  // 检查是否已有 Identity 章节
  if (/^##?\s*(Identity|你的身份|Role|角色)\s*$/im.test(content)) {
    skipped++; return { fixed, skipped };
  }

  // 从第一条标题推断
  const firstLine = content.split("\n").find(l => l.startsWith("# "));
  const agentName = firstLine ? firstLine.replace(/^#+\s*/, "").trim() : path.basename(agentPath);

  const identitySection = [
    ``,
    `## Identity`,
    ``,
    `**Role**: ${agentName}`,
    ``,
    `You are ${agentName}. Follow these principles:`,
    ``,
    `- **Expertise**: Apply deep domain knowledge to solve user problems`,
    `- **Clarity**: Provide clear, actionable responses`,
    `- **Safety**: Never perform harmful or unauthorized actions`,
    `- **Accuracy**: Verify information before sharing`,
  ].join("\n");

  // 在第一个 ## 章节前插入
  const firstH2Idx = content.search(/^##\s+/m);
  if (firstH2Idx >= 0) {
    content = content.slice(0, firstH2Idx) + identitySection + "\n" + content.slice(firstH2Idx);
  } else {
    content = content + identitySection;
  }

  if (!dryRun) fs.writeFileSync(systemPath, content, "utf-8");
  fixed++;
  return { fixed, skipped };
}

// ── 主逻辑 ─────────────────────────────────────────

interface ReportIssue {
  code: string;
  dimension: string;
  severity: string;
  description: string;
}

interface ReportAgent {
  id: string;
  path: string;
  issues: ReportIssue[];
}

interface ReportData {
  allAgents: ReportAgent[];
}

async function main() {
  const opts = parseArgs();
  const reportPath = path.resolve(opts.input);

  if (!fs.existsSync(reportPath)) {
    console.error(`❌ 报告文件不存在: ${reportPath}`);
    process.exit(1);
  }

  let reportData: ReportData;
  try {
    reportData = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  } catch {
    console.error("❌ 无法解析 JSON 报告");
    process.exit(1);
  }

  const agents = reportData.allAgents.filter(a => {
    if (opts.category && !a.path.includes(`/${opts.category}/`)) return false;
    return true;
  });

  console.log(`🔧 Agent 批量优化`);
  console.log(`   报告: ${reportPath}`);
  console.log(`   目标 Agent: ${agents.length} 个`);
  console.log(`   模式: ${opts.dryRun ? "dry-run（不写入）" : "实际修改"}`);
  if (opts.category) console.log(`   分类: ${opts.category}`);
  console.log("");

  const stats = {
    domain: { fixed: 0, skipped: 0 },
    agentId: { fixed: 0, skipped: 0 },
    safetyMd: { fixed: 0, skipped: 0 },
    identity: { fixed: 0, skipped: 0 },
  };

  const recommendations: Array<{ path: string; code: string; issue: string; fix: string }> = [];

  for (const agent of agents) {
    const agentPath = agent.path;
    const issueCodes = new Set(agent.issues.map(i => i.code));

    if (issueCodes.has("R053") || issueCodes.has("R051")) {
      const result = fixDomainPrimary(agentPath, opts.dryRun);
      stats.domain.fixed += result.fixed;
      stats.domain.skipped += result.skipped;
    }

    if (issueCodes.has("R062")) {
      const result = fixAgentIdConsistency(agentPath, opts.dryRun);
      stats.agentId.fixed += result.fixed;
      stats.agentId.skipped += result.skipped;
    }

    if (issueCodes.has("R003") || issueCodes.has("R021") || issueCodes.has("R023")) {
      const result = fixSafetyMd(agentPath, opts.dryRun);
      stats.safetyMd.fixed += result.fixed;
      stats.safetyMd.skipped += result.skipped;
    }

    if (issueCodes.has("R013")) {
      const result = fixSystemMdIdentity(agentPath, opts.dryRun);
      stats.identity.fixed += result.fixed;
      stats.identity.skipped += result.skipped;
    }

    // 收集无法自动修复的问题
    const autoFixable = new Set(["R053", "R051", "R062", "R003", "R021", "R023", "R013"]);
    for (const issue of agent.issues) {
      if (!autoFixable.has(issue.code) && issue.severity === "error") {
        recommendations.push({
          path: agentPath,
          code: issue.code,
          issue: issue.description,
          fix: getFixSuggestion(issue),
        });
      }
    }
  }

  console.log("📊 自动修复结果:");
  console.log(`   domain.primary 补全: ${stats.domain.fixed} 修复, ${stats.domain.skipped} 跳过`);
  console.log(`   agent.yaml id 修正: ${stats.agentId.fixed} 修复, ${stats.agentId.skipped} 跳过`);
  console.log(`   prompts/safety.md 生成: ${stats.safetyMd.fixed} 修复, ${stats.safetyMd.skipped} 跳过`);
  console.log(`   system.md Identity 章节: ${stats.identity.fixed} 修复, ${stats.identity.skipped} 跳过`);
  console.log("");

  const totalFixed = stats.domain.fixed + stats.agentId.fixed + stats.safetyMd.fixed + stats.identity.fixed;
  if (totalFixed > 0 && !opts.dryRun) {
    console.log(`✅ 自动修复完成: ${totalFixed} 项修改`);
    console.log("");
  }

  if (recommendations.length > 0) {
    console.log(`⚠️  需要人工处理（${recommendations.length} 项）:`);
    const byIssue = new Map<string, typeof recommendations>();
    for (const rec of recommendations) {
      if (!byIssue.has(rec.code)) byIssue.set(rec.code, []);
      byIssue.get(rec.code)!.push(rec);
    }
    for (const [code, recs] of byIssue) {
      const sample = recs[0];
      console.log(`\n  ${code}: ${sample.issue}`);
      console.log(`    → ${sample.fix}`);
      if (recs.length > 1) {
        console.log(`    （影响 ${recs.length} 个 Agent，包括: ${recs.slice(0, 3).map(r => r.path.split("/").pop()).join(", ")}...）`);
      }
    }
  }

  if (opts.dryRun) {
    console.log("\n💡 这是 dry-run 模式，未实际写入任何文件");
    console.log("   移除 --dry-run 标志以执行实际修改");
  }
}

function getFixSuggestion(issue: ReportIssue): string {
  switch (issue.code) {
    case "R001": return "创建 main.ts 作为 Agent 运行时入口（参考 LIAS 规范模板）";
    case "R002": return "创建 prompts/system.md 定义 Agent 角色和能力";
    case "R004": return "创建 src/ 目录包含 types.ts, loop.ts, provider.ts";
    case "R005": return "补全 src/ 目录中的必需文件";
    case "R006": return "创建 package.json 包含必要依赖（参考 LIAS 模板）";
    case "R012": return "prompts/system.md 内容为空，需要补充角色定义";
    case "R031": return "创建 skills/ 目录和 SKILL.md 文件定义 Agent 技能";
    case "R020": return "创建 prompts/safety.md 定义安全红线和约束";
    default: return "参考 LIAS 规范补全相关文件";
  }
}

main().catch((e) => {
  console.error("❌ 优化失败:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

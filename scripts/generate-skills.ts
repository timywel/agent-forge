/**
 * generate-skills.ts — 为 Agent 生成 SKILL.md（Agent Skills 规范）
 *
 * 从 prompts/system.md 的 Capabilities 章节提取技能，
 * 生成 .claude/skills/<skill-name>/SKILL.md 文件
 *
 * 使用方法:
 *   npx tsx scripts/generate-skills.ts --input /path/to/agent [--dry-run]
 *   npx tsx scripts/generate-skills.ts --batch /path/to/agency-agents --dry-run
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
    console.error("用法: tsx scripts/generate-skills.ts --input <path> [--batch] [--dry-run] [--force] [-v]");
    process.exit(1);
  }
  return opts;
}

// ── 技能提取 ─────────────────────────────────────────

interface Capability {
  name: string;       // kebab-case
  description: string;
  raw: string;
}

function extractCapabilities(systemMdPath: string): Capability[] {
  if (!fs.existsSync(systemMdPath)) return [];

  const content = fs.readFileSync(systemMdPath, "utf-8");
  const capabilities: Capability[] = [];

  // 按章节拆分
  const sections = content.split(/^##\s+/m);

  for (const section of sections) {
    const lines = section.split("\n");
    const heading = lines[0]?.trim().toLowerCase() ?? "";

    // 识别能力章节
    const isCapSection =
      heading.includes("capabilit") ||
      heading.includes("能力") ||
      heading.includes("mission") ||
      heading.includes("目标") ||
      heading.includes("specialized");

    if (!isCapSection) continue;

    // 提取列表项
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        let item = trimmed.replace(/^[-*]\s*/, "").trim();
        // 去除粗体标记
        item = item.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");

        if (item.length < 5) continue;
        // 过滤无意义的项
        if (/^(Hard rule|PRIORITY|DEFAULT|NOTE|TIP|REMEMBER|ALWAYS|NEVER)[:：]/i.test(item)) continue;
        if (/^(必须|禁止|never|always)/i.test(item)) continue;

        const cap = parseCapability(item);
        if (cap) capabilities.push(cap);
      }
    }
  }

  // 去重
  const seen = new Set<string>();
  return capabilities.filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

function parseCapability(item: string): Capability | null {
  // 格式: "名称: 描述" 或 直接描述
  let name: string;
  let description: string;

  const colonIdx = item.indexOf(":");
  if (colonIdx > 0 && colonIdx < 60) {
    name = item.slice(0, colonIdx).trim();
    description = item.slice(colonIdx + 1).trim();
  } else {
    // 从描述提取名称
    name = item;
    description = item;
  }

  // 清理名称（所有特殊字符都使用全局正则确保完全替换）
  name = name
    .replace(/'/g, "").replace(/"/g, "")
    .replace(/[—–−–]/g, " ").replace(/[×→+]/g, " ")
    .replace(/[&()[\]{}|<>!@#$%^*=]/g, " ")
    .replace(/[./\\]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/[()]/g, "")  // 全局移除括号
    .replace(/\s+/g, " ").trim();

  if (name.length < 2) return null;

  // 转 kebab-case
  const kebabName = toKebabCase(name);

  // 限制描述长度
  if (description.length > 200) {
    description = description.slice(0, 197) + "...";
  }

  return { name: kebabName, description, raw: item };
}

function toKebabCase(str: string): string {
  return str
    .replace(/^-+|-+$/g, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[()[\]{}|<>!@#$%^*=]/g, "") // 全局移除括号等特殊字符
    .replace(/[—–−–]/g, " ").replace(/[×→+]/g, " ")
    .replace(/[&./\\]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .replace(/^(\d)/, "n-$1");
}

// ── SKILL.md 生成 ─────────────────────────────────

function generateSkillMd(cap: Capability, agentName: string, domain: string): string {
  const titleName = cap.name
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const safeDesc = ((cap.description && cap.description.length >= 5) ? cap.description : cap.raw).replace(/"/g, '\\"');
  return [
    `---`,
    `name: ${cap.name}`,
    `description: "${safeDesc}"`,
    `compatibility: 需要 Claude Code 或兼容的 Agent 运行时`,
    `allowedTools: Read, Glob, Grep, Write, Edit, Bash`,
    `...`,
    ``,
    `# ${titleName}`,
    ``,
    `## 使用步骤`,
    ``,
    `1. 理解任务需求，明确 ${titleName} 的目标和范围`,
    `2. 收集相关信息和上下文`,
    `3. 按照领域最佳实践执行 ${titleName} 任务`,
    `4. 验证输出质量，确保符合要求`,
    `5. 如有不确定之处，主动寻求澄清`,
    ``,
    `## 输入输出示例`,
    ``,
    `**输入**：任务描述或相关参数`,
    ``,
    `**输出**：执行结果或结构化响应`,
    ``,
    `## 边界情况`,
    ``,
    `- 遇到超出范围的问题时，明确告知并建议替代方案`,
    `- 数据缺失或不完整时，说明原因并提供可用结果`,
  ].join("\n");
}

// ── 主逻辑 ─────────────────────────────────────────

function generateSkillsForAgent(agentDir: string, dryRun = false, force = false): { fixed: number; skipped: number; errors: string[] } {
  let fixed = 0, skipped = 0;
  const errors: string[] = [];

  // 提取 Agent 名称和领域
  let agentName = path.basename(agentDir);
  let domain = "";

  const agentMdPath = path.join(agentDir, "AGENT.md");
  if (fs.existsSync(agentMdPath)) {
    try {
      const content = fs.readFileSync(agentMdPath, "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const lines = fmMatch[1].split("\n");
        for (const line of lines) {
          const m = line.match(/^name:\s*(.+)$/);
          if (m) { agentName = m[1].trim(); }
          const dm = line.match(/^  primary:\s*(.+)$/);
          if (dm) { domain = dm[1].trim(); }
        }
      }
    } catch {}
  }

  // 提取 capabilities
  const systemMdPath = path.join(agentDir, "prompts", "system.md");
  const capabilities = extractCapabilities(systemMdPath);

  if (capabilities.length === 0) {
    // 为无 capabilities 的 agent 生成默认 skill
    const defaultCap = {
      name: toKebabCase(agentName),
      description: agentName,
      raw: `默认能力: ${agentName}`,
    };
    capabilities.push(defaultCap);
  }

  // 确保 .claude/skills/ 目录存在
  const skillsRoot = path.join(agentDir, ".claude", "skills");
  if (!fs.existsSync(skillsRoot) && !dryRun) {
    fs.mkdirSync(skillsRoot, { recursive: true });
  }

  for (const cap of capabilities) {
    const skillDir = path.join(skillsRoot, cap.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (fs.existsSync(skillMdPath) && !force && !dryRun) {
      skipped++;
      continue;
    }

    const content = generateSkillMd(cap, agentName, domain);

    if (!dryRun) {
      try {
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(skillMdPath, content, "utf-8");
        fixed++;
      } catch (e) {
        errors.push(`写入失败 ${cap.name}: ${e instanceof Error ? e.message : String(e)}`);
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

  console.log(`🔧 SKILL.md 生成`);
  console.log(`   输入路径: ${inputPath}`);
  console.log(`   目标 Agent: ${agentDirs.length} 个`);
  console.log(`   模式: ${opts.dryRun ? "dry-run（不写入）" : "实际生成"}${opts.force ? "（强制覆盖）" : ""}`);
  console.log("");

  let totalFixed = 0, totalSkipped = 0, totalCapabilties = 0;
  const allErrors: string[] = [];

  for (const agentDir of agentDirs) {
    const result = generateSkillsForAgent(agentDir, opts.dryRun, opts.force);
    totalFixed += result.fixed;
    totalSkipped += result.skipped;
    totalCapabilties += result.fixed + result.skipped;
    allErrors.push(...result.errors);

    if (opts.verbose) {
      console.log(`  ${path.basename(agentDir)}: +${result.fixed} 生成, ${result.skipped} 跳过`);
    }
  }

  console.log(`📊 生成结果:`);
  console.log(`   生成 SKILL.md: ${totalFixed}`);
  console.log(`   跳过（已存在）: ${totalSkipped}`);
  console.log(`   总计技能数: ${totalCapabilties}`);
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
    console.log(`\n✅ 生成完成: ${totalFixed} 个 SKILL.md`);
  }
}

main().catch((e) => {
  console.error("❌ 生成失败:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

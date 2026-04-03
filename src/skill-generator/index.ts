/**
 * Skill 生成器
 *
 * 根据 Agent Skills 规范（https://agentskills.io/specification）生成 SKILL.md 文件。
 *
 * 架构：
 * - GeneratedSkill：SKILL.md 格式（frontmatter + markdown body）
 * - LIASSkill：TypeScript skill 格式（LIAS 运行时特有）
 */

import { spawn } from "node:child_process";
import yaml from "js-yaml";

// ── 类型定义 ──────────────────────────────────────────────

export interface SkillGenOptions {
  /** LLM 端点（用于 NL 模式） */
  llmEndpoint?: string;
  /** Skill 标签（用于 metadata.tags） */
  tags?: string[];
  /** Agent 的领域 */
  domain?: string;
  /** Agent 角色 */
  agentRole?: string;
  /** 是否强制使用 NL 模式（LLM 不可用时报错） */
  requireLLM?: boolean;
  /** 默认 allowed-tools（空格分隔字符串） */
  allowedTools?: string;
  /** 默认 compatibility */
  compatibility?: string;
}

/**
 * GeneratedSkill — SKILL.md 格式
 *
 * 遵循 Agent Skills 规范（https://agentskills.io/specification）的 frontmatter + markdown_body。
 * 用于生成 .claude/skills/{name}/SKILL.md 文件。
 */
export interface GeneratedSkill {
  // ── Agent Skills 规范 frontmatter 字段 ──
  /** Skill 名称（kebab-case，1-64 字符，必填；必须与父目录名一致） */
  name: string;
  /** 描述用途（1-1024 字符，必填） */
  description: string;
  /** 环境依赖说明（≤500 字符） */
  compatibility?: string;
  /** 自定义键值映射 */
  metadata?: Record<string, string>;
  /** 空格分隔的预批准工具列表 */
  allowedTools?: string[];

  // ── Markdown 正文 ──
  /** Markdown 正文（Skill 被激活时完整加载） */
  markdownBody: string;

  // ── 生成元数据 ──
  /** 生成方式 */
  generatedBy: "nl" | "rule";
}

export class SkillGenerator {
  private options: SkillGenOptions;

  constructor(options: SkillGenOptions = {}) {
    this.options = options;
  }

  /**
   * 从能力列表生成 GeneratedSkill（SKILL.md 格式）
   */
  async generateFromCapabilities(capabilities: string[]): Promise<GeneratedSkill[]> {
    if (this.options.llmEndpoint) {
      try {
        const nlSkills = await this.generateWithNL(capabilities);
        if (nlSkills.length > 0) {
          return nlSkills;
        }
      } catch (err) {
        console.warn(`NL 模式失败，切换到规则模式: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return this.generateWithRules(capabilities);
  }

  /**
   * NL 模式：调用 skill-forge NLConverter 生成 SKILL.md 格式
   */
  private async generateWithNL(capabilities: string[]): Promise<GeneratedSkill[]> {
    const skills: GeneratedSkill[] = [];
    const tags = this.options.tags ?? [];

    for (const cap of capabilities) {
      try {
        const skill = await this.callNLConverter(cap, tags);
        if (skill) skills.push(skill);
      } catch (err) {
        console.warn(`NL 生成失败（${cap.slice(0, 30)}...）: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return skills;
  }

  /**
   * 调用 skill-forge NLConverter
   */
  private async callNLConverter(description: string, tags: string[]): Promise<GeneratedSkill | null> {
    return new Promise((resolve, reject) => {
      const skillForgeDir = "/home/timywel/AI_Product/规范/skill/skill-forge";
      const input = JSON.stringify({
        description,
        agentName: this.options.agentRole ?? "Agent",
        domain: this.options.domain ?? "",
        tags,
      });

      const proc = spawn("python3", [
        "-c",
        `
import sys, json, os
for k in ['http_proxy','https_proxy','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','all_proxy']:
    os.environ.pop(k, None)

from skill_forge.SkillConverter.nl_converter import NLConverter
from skill_forge.llm.test_client import TestLLMClient

try:
    llm = TestLLMClient(endpoint="${this.options.llmEndpoint ?? "http://127.0.0.1:15721"}")
    if not llm.health_check():
        print("LLM_UNAVAILABLE", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"LLM_INIT_ERROR: {e}", file=sys.stderr)
    sys.exit(1)

try:
    data = json.loads(sys.stdin.read())
    converter = NLConverter()
    result = converter.convert(
        data["description"],
        llm=llm,
        tags=data.get("tags", [])
    )
    print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    print(f"NL_ERROR: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`,
      ], {
        cwd: skillForgeDir,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("error", (err) => { reject(new Error(`子进程启动失败: ${err.message}`)); });

      proc.on("close", (code) => {
        if (code !== 0) {
          if (stderr.includes("LLM_UNAVAILABLE")) {
            reject(new Error("LLM_UNAVAILABLE"));
          } else if (stderr.includes("NL_ERROR")) {
            reject(new Error(`NL 转换错误: ${stderr.slice(0, 200)}`));
          } else {
            reject(new Error(`子进程退出码 ${code}: ${stderr.slice(0, 200)}`));
          }
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const skill: GeneratedSkill = {
            name: data.name ?? toKebabCase(description.slice(0, 40)),
            description: data.description ?? description,
            compatibility: data.compatibility,
            metadata: data.metadata,
            allowedTools: data.allowed_tools
              ? (Array.isArray(data.allowed_tools) ? data.allowed_tools : data.allowed_tools.split(" "))
              : (this.options.allowedTools ? this.options.allowedTools.split(" ") : ["Read", "Glob", "Grep", "Write", "Edit", "Bash"]),
            markdownBody: data.markdown_body ?? "",
            generatedBy: "nl",
          };
          resolve(skill);
        } catch (e) {
          reject(new Error(`解析 NL 输出失败: ${stdout.slice(0, 100)}`));
        }
      });

      proc.stdin?.write(input);
      proc.stdin?.end();

      setTimeout(() => {
        proc.kill();
        reject(new Error("NL 转换超时（60秒）"));
      }, 60000);
    });
  }

  /**
   * 规则模式：智能合并相似能力，生成 SKILL.md 格式
   */
  private generateWithRules(capabilities: string[]): GeneratedSkill[] {
    const rawSkills = capabilities
      .map((cap) => this.extractSkillInfo(cap))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const mergedSkills = this.mergeSimilarSkills(rawSkills);
    const tags = this.options.tags ?? [];
    const domain = this.options.domain ?? "";

    return mergedSkills.map((skill) => {
      const tagSet = new Set([domain, ...tags].filter(Boolean));
      const metadata: Record<string, string> = {};
      if (tagSet.size > 0) {
        metadata["tags"] = [...tagSet].join(" ");
      }

      return {
        name: skill.name,
        description: skill.description,
        compatibility: this.options.compatibility,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        allowedTools: this.options.allowedTools
          ? this.options.allowedTools.split(" ")
          : ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        markdownBody: this.generateMarkdownBody(skill.name, skill.description, domain),
        generatedBy: "rule" as const,
      };
    });
  }

  private extractSkillInfo(cap: string): { name: string; description: string } | null {
    if (!cap || cap.length < 5) return null;
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

    const cleanName = name
      .replace(/[—–−–_]/g, " ")
      .replace(/[:：,.!?()[\]{}【】『』「」<>《》\/\\|`~@#$%^&*+=]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanName.length < 2) return null;

    return { name: cleanName, description };
  }

  private mergeSimilarSkills(skills: { name: string; description: string }[]): { name: string; description: string }[] {
    const result: { name: string; description: string }[] = [];
    const used = new Set<number>();

    for (let i = 0; i < skills.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      let current = skills[i];

      for (let j = i + 1; j < skills.length; j++) {
        if (used.has(j)) continue;
        if (this.areSimilar(current.name, skills[j].name)) {
          if (skills[j].description.length > current.description.length) {
            current = { name: current.name, description: skills[j].description };
          }
          used.add(j);
        }
      }

      result.push(current);
    }

    return result;
  }

  private areSimilar(a: string, b: string): boolean {
    const aNorm = a.toLowerCase().replace(/[-_\s]+/g, "").replace(/'/g, "");
    const bNorm = b.toLowerCase().replace(/[-_\s]+/g, "").replace(/'/g, "");
    if (aNorm === bNorm) return true;
    if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;
    if (this.similarity(aNorm, bNorm) > 0.7) return true;
    return false;
  }

  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    return 1 - this.levenshtein(a, b) / Math.max(a.length, b.length);
  }

  private levenshtein(a: string, b: string): number {
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
   * 生成 SKILL.md Markdown 正文
   * 遵循 Agent Skills 规范推荐结构：使用步骤、输入输出示例、边界情况
   */
  private generateMarkdownBody(name: string, description: string, domain: string): string {
    const titleName = name
      .split(/[\s-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
}

// ── 辅助函数 ──────────────────────────────────────────────

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

export function toUpperSnake(str: string): string {
  return toSnakeCase(str).toUpperCase();
}

/**
 * 将 GeneratedSkill 序列化为 SKILL.md 文件内容
 *
 * 遵循 Agent Skills 规范（https://agentskills.io/specification）。
 */
export function generatedSkillToMd(skill: GeneratedSkill): string {
  // 使用 yaml 序列化确保所有值正确引用
  const frontmatter: Record<string, unknown> = {
    name: skill.name,
    description: skill.description,
  };
  if (skill.compatibility) {
    frontmatter.compatibility = skill.compatibility;
  }
  if (skill.metadata && Object.keys(skill.metadata).length > 0) {
    frontmatter.metadata = skill.metadata;
  }
  if (skill.allowedTools && skill.allowedTools.length > 0) {
    frontmatter["allowed-tools"] = skill.allowedTools.join(" ");
  }

  const fm = yaml.dump(frontmatter, { quotingType: '"', lineWidth: -1 }).trim();

  return `---\n${fm}\n---\n\n${skill.markdownBody}`;
}

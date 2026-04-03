/**
 * Skill 验证规则
 *
 * L020-L025: TypeScript Skill 验证（LIAS 运行时 skills/STAR.ts）
 * L030-L033: SKILL.md 验证（Agent Skills 规范）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { ValidationIssue } from "../../types/index.js";

// ── 命名正则 ──────────────────────────────────────────────

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const TOOL_EXPORT = /export\s+const\s+\w+_TOOL\s*:/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

// ── TypeScript Skill 验证（L020-L025）───────────────────────

export function validateSkills(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const skillsDir = path.join(agentDir, "skills");

  if (fs.existsSync(skillsDir)) {
    let skillFiles: string[];
    try {
      skillFiles = fs.readdirSync(skillsDir)
        .filter(f => f.endsWith(".ts") && f !== "index.ts");
    } catch {
      return issues;
    }

    for (const file of skillFiles) {
      const filePath = path.join(skillsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const skillName = file.replace(/\.ts$/, "");

      // L020: 文件名应为 kebab-case
      if (!KEBAB_CASE.test(skillName)) {
        issues.push({
          code: "L020",
          severity: "warning",
          message: `Skill 文件名应使用 kebab-case: "${file}"`,
          file: filePath,
        });
      }

      // L021: 必须导出 *_TOOL 常量
      if (!TOOL_EXPORT.test(content)) {
        issues.push({
          code: "L021",
          severity: "error",
          message: `Skill 文件必须导出 *_TOOL 常量: ${file}`,
          file: filePath,
          suggestion: `添加 export const ${skillName.replace(/-/g, "_")}_TOOL: Tool<...> = {...}`,
        });
      }

      // L022: handler 应有 try/catch
      if (content.includes("async execute") && !content.includes("try") && !content.includes("catch")) {
        issues.push({
          code: "L022",
          severity: "warning",
          message: `Skill handler 应包含 try/catch 错误处理: ${file}`,
          file: filePath,
        });
      }

      // L023: inputSchema 导出检查
      const schemaExport = new RegExp("export\\s+const\\s+\\\w+_inputSchema\\s*=");
      if (!schemaExport.test(content)) {
        issues.push({
          code: "L023",
          severity: "warning",
          message: `Skill 文件应导出 *_inputSchema: ${file}`,
          file: filePath,
        });
      }
    }

    // L024: skills/index.ts 应存在并导出所有 skill
    const indexPath = path.join(skillsDir, "index.ts");
    if (skillFiles.length > 0 && !fs.existsSync(indexPath)) {
      issues.push({
        code: "L024",
        severity: "error",
        message: "skills/index.ts 必须存在（当有 skill 文件时）",
        file: indexPath,
        suggestion: "创建 skills/index.ts 导出所有 skill tools",
      });
    }

    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, "utf-8");
      if (!indexContent.includes("allTools") && !indexContent.includes("export")) {
        issues.push({
          code: "L025",
          severity: "warning",
          message: "skills/index.ts 应导出 allTools 数组",
          file: indexPath,
        });
      }
    }
  }

  // ── SKILL.md 验证（L030-L033）─────────────────────────────
  issues.push(...validateSkillMd(agentDir));

  return issues;
}

/**
 * 验证 .claude/skills/{skill}/SKILL.md 文件
 * 遵循 Agent Skills 规范（https://agentskills.io/specification）
 */
function validateSkillMd(agentDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const skillsDir = path.join(agentDir, ".claude", "skills");

  if (!fs.existsSync(skillsDir)) {
    return issues;
  }

  let skillDirs: string[];
  try {
    skillDirs = fs.readdirSync(skillsDir).filter(f => {
      const fullPath = path.join(skillsDir, f);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch {
    return issues;
  }

  for (const dirName of skillDirs) {
    const skillMdPath = path.join(skillsDir, dirName, "SKILL.md");
    const skillMdDir = path.join(skillsDir, dirName);

    // L033: 每个子目录应有且仅有一个 SKILL.md
    if (!fs.existsSync(skillMdPath)) {
      issues.push({
        code: "L033",
        severity: "warning",
        message: `.claude/skills/${dirName}/ 目录下缺少 SKILL.md`,
        file: skillMdDir,
      });
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    // 解析 frontmatter
    const match = FRONTMATTER.exec(content);
    if (!match) {
      issues.push({
        code: "L030",
        severity: "error",
        message: `SKILL.md 缺少 YAML frontmatter: .claude/skills/${dirName}/SKILL.md`,
        file: skillMdPath,
      });
      continue;
    }

    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = yaml.load(match[1]) as Record<string, unknown>;
    } catch {
      issues.push({
        code: "L030",
        severity: "error",
        message: `SKILL.md frontmatter 格式错误: .claude/skills/${dirName}/SKILL.md`,
        file: skillMdPath,
      });
      continue;
    }

    // L030: name 必填，kebab-case，1-64 字符
    const name = frontmatter["name"] as string | undefined;
    if (!name) {
      issues.push({
        code: "L030",
        severity: "error",
        message: `SKILL.md frontmatter 缺少必填字段 "name": .claude/skills/${dirName}/SKILL.md`,
        file: skillMdPath,
      });
    } else {
      if (typeof name !== "string") {
        issues.push({
          code: "L030",
          severity: "error",
          message: `SKILL.md "name" 必须为字符串: .claude/skills/${dirName}/SKILL.md`,
          file: skillMdPath,
        });
      } else {
        if (name.length < 1 || name.length > 64) {
          issues.push({
            code: "L030",
            severity: "error",
            message: `SKILL.md "name" 长度需在 1-64 字符之间: "${name}"`,
            file: skillMdPath,
          });
        }
        if (!KEBAB_CASE.test(name)) {
          issues.push({
            code: "L030",
            severity: "error",
            message: `SKILL.md "name" 必须为 kebab-case: "${name}"`,
            file: skillMdPath,
          });
        }
        // L032: name 必须与父目录名一致
        if (name !== dirName) {
          issues.push({
            code: "L032",
            severity: "error",
            message: `SKILL.md "name" 必须与父目录名一致: "${name}" ≠ "${dirName}"`,
            file: skillMdPath,
          });
        }
      }
    }

    // L031: description 必填，1-1024 字符
    const description = frontmatter["description"] as string | undefined;
    if (!description) {
      issues.push({
        code: "L031",
        severity: "error",
        message: `SKILL.md frontmatter 缺少必填字段 "description": .claude/skills/${dirName}/SKILL.md`,
        file: skillMdPath,
      });
    } else {
      if (typeof description !== "string") {
        issues.push({
          code: "L031",
          severity: "error",
          message: `SKILL.md "description" 必须为字符串: .claude/skills/${dirName}/SKILL.md`,
          file: skillMdPath,
        });
      } else if (description.length < 1 || description.length > 1024) {
        issues.push({
          code: "L031",
          severity: "error",
          message: `SKILL.md "description" 长度需在 1-1024 字符之间`,
          file: skillMdPath,
        });
      }
    }
  }

  return issues;
}

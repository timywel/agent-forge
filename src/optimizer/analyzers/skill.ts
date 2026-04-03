/**
 * Skill 质量分析器
 *
 * 评估 SKILL.md 质量（Agent Skills 规范）和 TypeScript Skill 质量（LIAS 运行时）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { Improvement } from "../../types/common.js";

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

export function analyzeSkills(agentDir: string): { score: number; improvements: Improvement[] } {
  const improvements: Improvement[] = [];
  let score = 100;

  // ── SKILL.md 质量分析 ──
  const skillMdScore = analyzeSkillMd(agentDir, improvements);
  score = Math.min(score, skillMdScore);

  // ── TypeScript Skill 质量分析（LIAS 运行时）──
  const tsSkillScore = analyzeTsSkills(agentDir, improvements);
  score = Math.min(score, tsSkillScore);

  return { score: Math.max(0, score), improvements };
}

function analyzeSkillMd(agentDir: string, improvements: Improvement[]): number {
  const skillsDir = path.join(agentDir, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) {
    return 100; // 无 SKILL.md 不扣分（可选）
  }

  let skillDirs: string[];
  try {
    skillDirs = fs.readdirSync(skillsDir).filter(f => {
      const fullPath = path.join(skillsDir, f);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch {
    improvements.push({
      id: "SM000", category: "skill", description: "无法读取 .claude/skills 目录",
      severity: "error", autoFixable: false, applied: false,
    });
    return 30;
  }

  if (skillDirs.length === 0) {
    return 100;
  }

  let mdScore = 100;

  for (const dirName of skillDirs) {
    const skillMdPath = path.join(skillsDir, dirName, "SKILL.md");

    if (!fs.existsSync(skillMdPath)) {
      mdScore -= 10;
      improvements.push({
        id: `SM001-${dirName}`, category: "skill", description: `缺少 SKILL.md: .claude/skills/${dirName}/SKILL.md`,
        severity: "warning", autoFixable: false, applied: false, file: skillMdPath,
      });
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(skillMdPath, "utf-8");
    } catch {
      mdScore -= 15;
      continue;
    }

    // frontmatter 解析
    const match = FRONTMATTER.exec(content);
    if (!match) {
      mdScore -= 20;
      improvements.push({
        id: `SM002-${dirName}`, category: "skill", description: `SKILL.md 缺少 frontmatter: ${dirName}`,
        severity: "error", autoFixable: false, applied: false, file: skillMdPath,
      });
      continue;
    }

    let fm: Record<string, unknown>;
    try {
      fm = yaml.load(match[1]) as Record<string, unknown>;
    } catch {
      mdScore -= 15;
      improvements.push({
        id: `SM002b-${dirName}`, category: "skill", description: `SKILL.md frontmatter 格式错误: ${dirName}`,
        severity: "error", autoFixable: false, applied: false, file: skillMdPath,
      });
      continue;
    }

    // name 检查
    const name = fm["name"] as string | undefined;
    if (!name) {
      mdScore -= 15;
      improvements.push({
        id: `SM010-${dirName}`, category: "skill", description: `SKILL.md 缺少必填字段 "name": ${dirName}`,
        severity: "error", autoFixable: false, applied: false, file: skillMdPath,
      });
    } else {
      if (typeof name !== "string" || !KEBAB_CASE.test(name)) {
        mdScore -= 10;
        improvements.push({
          id: `SM011-${dirName}`, category: "skill", description: `SKILL.md "name" 应为 kebab-case: "${name}"`,
          severity: "error", autoFixable: false, applied: false, file: skillMdPath,
        });
      }
      if (name !== dirName) {
        mdScore -= 5;
        improvements.push({
          id: `SM012-${dirName}`, category: "skill", description: `SKILL.md "name" 应与父目录名一致: "${name}" vs "${dirName}"`,
          severity: "warning", autoFixable: false, applied: false, file: skillMdPath,
        });
      }
    }

    // description 检查
    const description = fm["description"] as string | undefined;
    if (!description) {
      mdScore -= 15;
      improvements.push({
        id: `SM020-${dirName}`, category: "skill", description: `SKILL.md 缺少必填字段 "description": ${dirName}`,
        severity: "error", autoFixable: false, applied: false, file: skillMdPath,
      });
    } else if (typeof description === "string" && description.length < 50) {
      mdScore -= 5;
      improvements.push({
        id: `SM021-${dirName}`, category: "skill", description: `SKILL.md "description" 过短（建议 100+ 字符）: ${dirName}`,
        severity: "warning", autoFixable: false, applied: false, file: skillMdPath,
      });
    }

    // 正文结构检查
    const body = content.slice(match[0].length).trim();
    if (body.length < 50) {
      mdScore -= 5;
      improvements.push({
        id: `SM030-${dirName}`, category: "skill", description: `SKILL.md 正文过短（建议包含使用步骤）: ${dirName}`,
        severity: "warning", autoFixable: false, applied: false, file: skillMdPath,
      });
    }
  }

  return Math.max(0, mdScore);
}

function analyzeTsSkills(agentDir: string, improvements: Improvement[]): number {
  const skillsDir = path.join(agentDir, "skills");
  if (!fs.existsSync(skillsDir)) {
    return 100; // 无 skills/*.ts 不扣分（可选）
  }

  let skillFiles: string[];
  try {
    skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith(".ts") && f !== "index.ts");
  } catch {
    improvements.push({
      id: "ST000", category: "skill", description: "无法读取 skills 目录",
      severity: "error", autoFixable: false, applied: false,
    });
    return 30;
  }

  if (skillFiles.length === 0) {
    return 100;
  }

  let tsScore = 100;

  for (const file of skillFiles) {
    const filePath = path.join(skillsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const skillName = file.replace(/\.ts$/, "");

    if (!KEBAB_CASE.test(skillName)) {
      tsScore -= 5;
      improvements.push({
        id: `ST010-${skillName}`, category: "skill", description: `Skill 文件名不符合 kebab-case: ${file}`,
        severity: "warning", autoFixable: false, applied: false, file: filePath,
      });
    }

    const hasToolExport = /export\s+const\s+\w+_TOOL\s*:/.test(content);
    if (!hasToolExport) {
      tsScore -= 10;
      improvements.push({
        id: `ST011-${skillName}`, category: "skill", description: `缺少 *_TOOL 导出: ${file}`,
        severity: "warning", autoFixable: false, applied: false, file: filePath,
      });
    }

    const hasSchemaExport = /export\s+const\s+\w+_inputSchema\s*=/.test(content);
    if (!hasSchemaExport) {
      tsScore -= 5;
      improvements.push({
        id: `ST012-${skillName}`, category: "skill", description: `缺少 *_inputSchema 导出: ${file}`,
        severity: "warning", autoFixable: false, applied: false, file: filePath,
      });
    }

    if (content.includes("async execute") && (!content.includes("try") || !content.includes("catch"))) {
      tsScore -= 5;
      improvements.push({
        id: `ST013-${skillName}`, category: "skill", description: `Handler 缺少 try/catch: ${file}`,
        severity: "warning", autoFixable: false, applied: false, file: filePath,
      });
    }
  }

  const indexPath = path.join(skillsDir, "index.ts");
  if (!fs.existsSync(indexPath)) {
    tsScore -= 10;
    improvements.push({
      id: "ST020", category: "skill", description: "缺少 skills/index.ts",
      severity: "warning", autoFixable: false, applied: false, file: indexPath,
    });
  }

  return Math.max(0, tsScore);
}

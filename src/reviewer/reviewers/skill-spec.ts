/**
 * SkillSpecReviewer — SKILL.md 规范评审
 * 权重: 15%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewSkillSpec(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  const skillsDir = path.join(agentDir, "skills");
  const claudeSkillsDir = path.join(agentDir, ".claude", "skills");

  if (!fs.existsSync(skillsDir) && !fs.existsSync(claudeSkillsDir)) {
    issues.push({ code: "R030", severity: "info", dimension: "skillSpec", description: "无 skills/ 或 .claude/skills/ 目录，跳过 SkillSpec 评审", location: agentDir });
    return { dimension: "skillSpec", score: 10, weight: 15, issues, highlights };
  }

  // 递归收集所有 SKILL.md 文件（支持 .claude/skills/{name}/SKILL.md 结构）
  const skillFiles: string[] = [];
  function collectSkillFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMd = path.join(dir, entry.name, "SKILL.md");
          if (fs.existsSync(skillMd)) skillFiles.push(skillMd);
        } else if (entry.name.endsWith(".md") && entry.name !== "_registry.yaml") {
          skillFiles.push(path.join(dir, entry.name));
        }
      }
    } catch {}
  }

  if (fs.existsSync(skillsDir)) collectSkillFiles(skillsDir);
  if (fs.existsSync(claudeSkillsDir)) collectSkillFiles(claudeSkillsDir);

  if (skillFiles.length === 0) {
    issues.push({ code: "R031", severity: "warning", dimension: "skillSpec", description: "skills/ 目录无 SKILL.md 文件", location: skillsDir, suggestion: "创建 SKILL.md 文件定义 Agent 可用技能" });
    score -= 2;
    return { dimension: "skillSpec", score: Math.max(0, score), weight: 15, issues, highlights };
  }

  let totalSkills = 0;
  let validSkills = 0;
  let totalSteps = 0;

  for (const skillPath of skillFiles) {
    const content = fs.readFileSync(skillPath, "utf-8");
    const sf = path.basename(path.dirname(skillPath));

    // 检查 YAML frontmatter（支持 --- 或 ... 作为关闭分隔符；body 可能含 --- 故用 loadAll）
    const fmMatch = content.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)/);
    if (!fmMatch) {
      issues.push({ code: "R032", severity: "warning", dimension: "skillSpec", description: `SKILL.md "${sf}" 缺少 YAML frontmatter`, location: skillPath, suggestion: "添加 YAML frontmatter 定义 skill 名称和描述" });
      continue;
    }

    let fm: Record<string, unknown> = {};
    try {
      // loadAll 处理 body 含 --- 的多文档 SKILL.md，取第一个文档
      const docs = yaml.loadAll(fmMatch[1]);
      fm = (docs[0] ?? {}) as Record<string, unknown>;
    } catch {
      issues.push({ code: "R033", severity: "warning", dimension: "skillSpec", description: `SKILL.md "${sf}" frontmatter YAML 格式错误`, location: skillPath, suggestion: "修复 YAML 语法" });
      continue;
    }

    totalSkills++;

    // 检查必需字段
    const skillName = fm.name as string | undefined;
    const skillDesc = fm.description as string | undefined;
    if (!skillName) {
      issues.push({ code: "R034", severity: "warning", dimension: "skillSpec", description: `SKILL.md "${sf}" 缺少 name 字段`, location: skillPath, suggestion: "添加 name: kebab-case 技能名称" });
    } else if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(skillName)) {
      issues.push({ code: "R035", severity: "warning", dimension: "skillSpec", description: `SKILL.md "${sf}" name "${skillName}" 不符合 kebab-case`, location: skillPath, suggestion: "修改为 kebab-case 格式" });
    }

    if (!skillDesc || skillDesc.length < 5) {
      issues.push({ code: "R036", severity: "warning", dimension: "skillSpec", description: `SKILL.md "${sf}" description 过短或缺失`, location: skillPath, suggestion: "提供完整的技能描述（≥10 字符）" });
    } else {
      validSkills++;
    }

    // 检查步骤完整性
    const stepCount = (content.match(/^\d+\.\s+/gm) ?? []).length;
    totalSteps += stepCount;
    if (stepCount === 0) {
      issues.push({ code: "R037", severity: "info", dimension: "skillSpec", description: `SKILL.md "${sf}" 无编号步骤定义`, location: skillPath, suggestion: "添加 ## 使用步骤 章节并使用 1. 2. 3. 格式" });
    } else if (stepCount >= 3) {
      highlights.push(`✅ SKILL.md "${sf}" 包含 ${stepCount} 个步骤`);
    }
  }

  if (totalSkills > 0) {
    if (validSkills === totalSkills) {
      highlights.push(`✅ 所有 ${totalSkills} 个 SKILL.md 格式规范`);
    }
    if (totalSteps >= 3) {
      highlights.push(`✅ 步骤定义完整（总计 ${totalSteps} 个步骤）`);
    }
  }

  // 扣分逻辑
  if (issues.filter(i => i.severity === "error").length > 0) score -= 3;
  else if (issues.filter(i => i.severity === "warning").length > 2) score -= 1.5;
  else if (issues.filter(i => i.severity === "warning").length > 0) score -= 0.5;

  return {
    dimension: "skillSpec",
    score: Math.max(0, score),
    weight: 15,
    issues,
    highlights,
  };
}

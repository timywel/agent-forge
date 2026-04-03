/**
 * NamingReviewer — 命名一致性评审
 * 权重: 5%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewNaming(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  const dirName = path.basename(agentDir);

  // 检查目录名是否为 kebab-case
  if (dirName && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(dirName)) {
    if (!/^[A-Z]/.test(dirName)) { // 排除 PascalCase（可能是故意的）
      issues.push({
        code: "R080",
        severity: "info",
        dimension: "naming",
        description: `目录名 "${dirName}" 不符合 kebab-case 规范`,
        location: agentDir,
        suggestion: "使用 kebab-case 命名目录（如 marketing-tiktok-strategist）",
      });
      score -= 0.5;
    }
  } else {
    highlights.push(`✅ 目录名规范: ${dirName}`);
  }

  // 检查 AGENT.md / agent.yaml 中的 id 和 name
  const agentMdPath = path.join(agentDir, "AGENT.md");
  const agentYamlPath = path.join(agentDir, "agent.yaml");
  const skillsDir = path.join(agentDir, "skills");

  if (fs.existsSync(agentMdPath)) {
    const md = fs.readFileSync(agentMdPath, "utf-8");
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      try {
        const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
        const id = fm.id as string | undefined;
        if (id && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
          issues.push({ code: "R081", severity: "warning", dimension: "naming", description: `AGENT.md id "${id}" 不符合 kebab-case`, location: agentMdPath, suggestion: "修改 id 为 kebab-case 格式" });
          score -= 1;
        }
      } catch {}
    }
  }

  if (fs.existsSync(agentYamlPath)) {
    try {
      const yd = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
      const m = (yd.metadata ?? yd) as Record<string, unknown>;
      const yamlId = m.id as string | undefined;
      if (yamlId && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(yamlId)) {
        issues.push({ code: "R082", severity: "warning", dimension: "naming", description: `agent.yaml id "${yamlId}" 不符合 kebab-case`, location: agentYamlPath, suggestion: "修改 id 为 kebab-case 格式" });
        score -= 1;
      }
    } catch {}
  }

  // 检查 skills/ 目录中的文件名
  if (fs.existsSync(skillsDir)) {
    let skillFiles: string[] = [];
    try {
      skillFiles = fs.readdirSync(skillsDir).filter(f => (f.endsWith(".ts") && f !== "index.ts") || f.endsWith(".md"));
    } catch {}

    let invalidSkillNames = 0;
    for (const sf of skillFiles) {
      const baseName = sf.replace(/\.(ts|md)$/, "");
      if (baseName !== "_registry" && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(baseName)) {
        if (!/^[A-Z]/.test(baseName)) {
          issues.push({ code: "R083", severity: "info", dimension: "naming", description: `Skill 文件名 "${sf}" 不符合 kebab-case`, location: path.join(skillsDir, sf), suggestion: "使用 kebab-case 命名 skill 文件" });
          invalidSkillNames++;
        }
      }
    }
    if (invalidSkillNames > 0) {
      score -= 0.5 * invalidSkillNames;
    } else if (skillFiles.length > 0) {
      highlights.push(`✅ 所有 ${skillFiles.length} 个 Skill 文件名规范`);
    }
  }

  // 检查 src/ 目录中的 TypeScript 文件
  const srcDir = path.join(agentDir, "src");
  if (fs.existsSync(srcDir)) {
    let tsFiles: string[] = [];
    try {
      tsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith(".ts"));
    } catch {}

    let invalidFileNames = 0;
    for (const tf of tsFiles) {
      const baseName = tf.replace(/\.ts$/, "");
      // src 文件应使用 kebab-case 或 PascalCase
      if (!/^[a-z][a-z0-9-]*$/.test(baseName) && !/^[A-Z][a-zA-Z0-9]*$/.test(baseName)) {
        issues.push({ code: "R084", severity: "info", dimension: "naming", description: `src 文件名 "${tf}" 命名不规范`, location: path.join(srcDir, tf), suggestion: "使用 kebab-case 或 PascalCase 命名" });
        invalidFileNames++;
      }
    }
    if (invalidFileNames > 0) score -= 0.3 * invalidFileNames;
  }

  return {
    dimension: "naming",
    score: Math.max(0, score),
    weight: 5,
    issues,
    highlights,
  };
}

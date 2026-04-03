/**
 * Skill 优化器
 *
 * 1. SKILL.md 质量优化（Agent Skills 规范）
 * 2. TypeScript Skill 优化（LIAS 运行时）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { Improvement } from "../../types/common.js";
import type { ILLMClient } from "../../llm/client.js";
import { SKILL_SCHEMA_INFER_PROMPT } from "../../llm/prompts.js";

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

export async function enhanceSkills(
  agentDir: string,
  llmClient?: ILLMClient
): Promise<Improvement[]> {
  const improvements: Improvement[] = [];

  // ── SKILL.md 优化 ──
  improvements.push(...await enhanceSkillMd(agentDir, llmClient));

  // ── TypeScript Skill 优化 ──
  improvements.push(...await enhanceTsSkills(agentDir, llmClient));

  return improvements;
}

/**
 * SKILL.md 质量优化（Agent Skills 规范）
 */
async function enhanceSkillMd(
  agentDir: string,
  llmClient?: ILLMClient
): Promise<Improvement[]> {
  const improvements: Improvement[] = [];
  const skillsDir = path.join(agentDir, ".claude", "skills");

  if (!fs.existsSync(skillsDir)) return [];

  let skillDirs: string[];
  try {
    skillDirs = fs.readdirSync(skillsDir).filter(f => {
      const fullPath = path.join(skillsDir, f);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch {
    return [];
  }

  for (const dirName of skillDirs) {
    const skillMdPath = path.join(skillsDir, dirName, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    let content: string;
    try {
      content = fs.readFileSync(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    const match = FRONTMATTER.exec(content);
    if (!match) continue;

    let fm: Record<string, unknown>;
    try {
      fm = yaml.load(match[1]) as Record<string, unknown>;
    } catch {
      continue;
    }

    let modified = false;

    // 自动修复 1: name 与父目录名不一致
    const name = fm["name"] as string | undefined;
    if (name && name !== dirName && typeof name === "string" && KEBAB_CASE.test(name)) {
      fm["name"] = dirName;
      modified = true;
      improvements.push({
        id: `ESM010-${dirName}`, category: "skill",
        description: `修正 SKILL.md "name" 与父目录名一致: "${name}" → "${dirName}"`,
        severity: "info", autoFixable: true, applied: true, file: skillMdPath,
        before: name, after: dirName,
      });
    }

    // 自动修复 2: 补全 description（通过 LLM）
    if (llmClient) {
      const description = fm["description"] as string | undefined;
      if (!description || (typeof description === "string" && description.length < 20)) {
        try {
          const skillBody = content.slice(match[0].length).trim().slice(0, 500);
          const response = await llmClient.chat(
            [{ role: "user", content: `Skill 目录名: ${dirName}\n正文内容:\n${skillBody}` }],
            `根据 Skill 目录名和正文内容，生成一个描述（1-1024 字符），说明该 Skill 的用途和使用场景。直接返回描述文本，不要包含 JSON 或其他格式。`
          );

          const inferred = response.content.trim();
          if (inferred.length >= 20 && inferred.length <= 1024) {
            fm["description"] = inferred;
            modified = true;
            improvements.push({
              id: `ESM020-${dirName}`, category: "skill",
              description: `通过 LLM 推断并补全 SKILL.md "description"`,
              severity: "info", autoFixable: true, applied: true, file: skillMdPath,
            });
          }
        } catch {
          improvements.push({
            id: `ESM021-${dirName}`, category: "skill",
            description: `"description" 推断失败: ${dirName}`,
            severity: "warning", autoFixable: false, applied: false, file: skillMdPath,
          });
        }
      }
    }

    if (modified) {
      // 重新构建文件
      const body = content.slice(match[0].length);
      const newFm = yaml.dump(fm, { indent: 2, lineWidth: -1, noRefs: true });
      const newContent = `---\n${newFm}---${body}`;
      fs.writeFileSync(skillMdPath, newContent, "utf-8");
    }
  }

  return improvements;
}

/**
 * TypeScript Skill 优化（LIAS 运行时）
 */
async function enhanceTsSkills(
  agentDir: string,
  llmClient?: ILLMClient
): Promise<Improvement[]> {
  const improvements: Improvement[] = [];
  const skillsDir = path.join(agentDir, "skills");

  if (!fs.existsSync(skillsDir)) return [];

  let skillFiles: string[];
  try {
    skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith(".ts") && f !== "index.ts");
  } catch {
    return [];
  }

  for (const file of skillFiles) {
    const filePath = path.join(skillsDir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // 自动修复: tool.name 应为 snake_case
    const toolNameMatch = /name:\s*["']([a-zA-Z0-9_-]+)["']/.exec(content);
    if (toolNameMatch) {
      const toolName = toolNameMatch[1];
      if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(toolName)) {
        const fixed = toolName.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase();
        if (fixed !== toolName) {
          const newContent = content.replace(
            new RegExp(`name:\\s*["']${toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`),
            `name: "${fixed}"`
          );
          fs.writeFileSync(filePath, newContent, "utf-8");
          improvements.push({
            id: `EST010-${file}`, category: "skill",
            description: `修正 tool.name 为 snake_case: "${toolName}" → "${fixed}"`,
            severity: "info", autoFixable: true, applied: true, file: filePath,
            before: toolName, after: fixed,
          });
          content = newContent;
        }
      }
    }

    // LLM 推断缺失的 inputSchema
    if (llmClient && skillFiles.length > 0) {
      const hasInputSchema = /inputSchema:\s*\{/.test(content);
      if (!hasInputSchema) {
        try {
          const skillName = file.replace(/\.ts$/, "");
          const response = await llmClient.chat(
            [{ role: "user", content: `Skill 名称: ${skillName}\n文件内容:\n${content.slice(0, 500)}` }],
            SKILL_SCHEMA_INFER_PROMPT
          );

          improvements.push({
            id: `EST020-${file}`, category: "skill",
            description: `inputSchema 推断建议: ${file}`,
            severity: "info", autoFixable: false, applied: false, file: filePath,
          });
        } catch {
          // ignore
        }
      }
    }
  }

  return improvements;
}

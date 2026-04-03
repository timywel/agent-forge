/**
 * Identity 增强器
 * 1. LLM 驱动：优化 system.md（含 SOP 生成）
 * 2. 规则回退：SOP 模板 + 行数补全
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";
import type { ILLMClient } from "../../llm/client.js";
import { IDENTITY_OPTIMIZE_PROMPT } from "../../llm/prompts.js";

/**
 * 基于 capabilities 生成 SOP 章节
 */
function generateSOPFromCapabilities(capabilities: string[]): string {
  const steps = capabilities.slice(0, 5).map((cap, i) => {
    // 提取能力的前半部分作为步骤描述
    const step = cap.replace(/^[-*\d.]+\s*/, "").trim();
    return `${i + 1}. ${step}`;
  });

  if (steps.length === 0) {
    steps.push("1. 理解任务需求，明确目标和范围");
    steps.push("2. 收集相关信息和上下文");
    steps.push("3. 按照领域最佳实践执行任务");
    steps.push("4. 验证输出质量");
    steps.push("5. 如有不确定，主动寻求澄清");
  }

  return `## SOP (Standard Operating Procedure)

${steps.join("\n")}`;
}

/**
 * 从 system.md 内容提取 capabilities
 */
function extractCapabilities(content: string): string[] {
  const capabilities: string[] = [];
  const sections = content.split(/^##\s+/m);

  for (const section of sections) {
    const heading = section.split("\n")[0] ?? "";
    const isCapSection = /capabilit|能力/i.test(heading);

    if (isCapSection) {
      const lines = section.split("\n").slice(1);
      for (const l of lines) {
        const line = l.trim();
        if (line.startsWith("-") || line.startsWith("*")) {
          const item = line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim();
          if (item && item.length > 5) {
            capabilities.push(item);
          }
        }
      }
    }
  }

  return capabilities;
}

export async function enhanceIdentity(
  agentDir: string,
  llmClient?: ILLMClient
): Promise<Improvement[]> {
  const improvements: Improvement[] = [];
  const systemMdPath = path.join(agentDir, "prompts", "system.md");
  if (!fs.existsSync(systemMdPath)) return improvements;

  const content = fs.readFileSync(systemMdPath, "utf-8");
  const lines = content.split("\n");
  const hasSOP = /#{1,3}\s+.*SOP.*/.test(content) ||
    /#{1,3}\s+.*Standard Operating Procedure.*/.test(content) ||
    /#{1,3}\s+.*流程.*/.test(content);
  const needsFix = !hasSOP || lines.length < 20;

  if (!needsFix) return improvements;

  // 优先 LLM 修复
  if (llmClient) {
    try {
      const response = await llmClient.chat(
        [{ role: "user", content: `当前 system.md:\n\n${content}` }],
        IDENTITY_OPTIMIZE_PROMPT
      );
      const optimized = response.content.trim();
      if (optimized && optimized !== content) {
        fs.writeFileSync(systemMdPath, optimized, "utf-8");
        improvements.push({
          id: "E001",
          category: "identity",
          description: "system.md 已通过 LLM 优化（已补充 SOP）",
          severity: "info",
          autoFixable: true,
          applied: true,
          before: content,
          after: optimized,
          file: systemMdPath,
        });
        return improvements;
      }
    } catch {
      // LLM 失败，回退到规则
    }
  }

  // 规则回退：添加 SOP 章节
  if (!hasSOP) {
    const capabilities = extractCapabilities(content);
    const sopSection = generateSOPFromCapabilities(capabilities);

    // 逐行扫描定位插入点：## Objective 或 ## Capabilities 的下一个 ## 标题之前
    // 这比复杂正则更可靠，避免行内 markdown 语法干扰匹配
    const origLines = content.split("\n");
    let insertAfterLine = -1; // 插入到该行之后（0-indexed）
    let inIdentitySection = false;

    for (let i = 0; i < origLines.length; i++) {
      const line = origLines[i];

      // 进入 Identity（Objective）章节
      if (/^##\s+\*?\*?Objective/i.test(line)) {
        inIdentitySection = true;
        continue;
      }

      // 进入 Capabilities 章节时插入
      if (/^##\s+.*Capabilit/i.test(line)) {
        // Capabilities 章节开始：扫描其结束位置
        for (let j = i + 1; j < origLines.length; j++) {
          if (/^##\s+\w/.test(origLines[j])) {
            insertAfterLine = j - 1;
            break;
          }
        }
        if (insertAfterLine === -1) insertAfterLine = i - 1;
        break;
      }

      // Identity 章节结束（遇到下一个 ## 标题）
      if (inIdentitySection && /^##\s+\w/.test(line)) {
        insertAfterLine = i - 1;
        break;
      }
    }

    let updated: string;
    if (insertAfterLine >= 0 && insertAfterLine < origLines.length) {
      const before = origLines.slice(0, insertAfterLine + 1).join("\n");
      const after = origLines.slice(insertAfterLine + 1).join("\n");
      updated = before + "\n" + sopSection + (after ? "\n" + after : "");
    } else {
      updated = content.trimEnd() + "\n\n" + sopSection;
    }

    fs.writeFileSync(systemMdPath, updated, "utf-8");
    improvements.push({
      id: "E001",
      category: "identity",
      description: `system.md 已补充 SOP（规则生成，${capabilities.length} 项能力）`,
      severity: "info",
      autoFixable: true,
      applied: true,
      before: content,
      after: updated,
      file: systemMdPath,
    });
  }

  return improvements;
}

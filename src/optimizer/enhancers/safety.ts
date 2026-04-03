/**
 * Safety 增强器
 * 1. LLM 驱动：优化 safety.md（补充 Fallback）
 * 2. 规则回退：默认 Fallback 章节
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";
import type { ILLMClient } from "../../llm/client.js";
import { SAFETY_OPTIMIZE_PROMPT } from "../../llm/prompts.js";

const DEFAULT_FALLBACK = `## Fallback Logic

When the request cannot be fulfilled, respond with:
- 明确告知用户无法满足的具体原因，避免模糊表述
- 提供可用的替代方案或简化方案
- 建议用户如何调整需求以满足可执行条件`;

export async function enhanceSafety(
  agentDir: string,
  llmClient?: ILLMClient
): Promise<Improvement[]> {
  const improvements: Improvement[] = [];
  const safetyMdPath = path.join(agentDir, "prompts", "safety.md");
  if (!fs.existsSync(safetyMdPath)) return improvements;

  const content = fs.readFileSync(safetyMdPath, "utf-8");
  const hasFallback = content.toLowerCase().includes("fallback") ||
    content.includes("拒绝") ||
    content.includes("apologize");

  if (hasFallback) return improvements;

  // 优先 LLM 修复
  if (llmClient) {
    try {
      const response = await llmClient.chat(
        [{ role: "user", content: `当前 safety.md:\n\n${content}` }],
        SAFETY_OPTIMIZE_PROMPT
      );
      const fallbackSection = response.content.trim();
      if (fallbackSection && fallbackSection.length > 10) {
        const updated = content.trimEnd() + "\n\n" + fallbackSection;
        fs.writeFileSync(safetyMdPath, updated, "utf-8");
        improvements.push({
          id: "E010",
          category: "safety",
          description: "safety.md 已通过 LLM 补充 Fallback Logic",
          severity: "info",
          autoFixable: true,
          applied: true,
          before: content,
          after: updated,
          file: safetyMdPath,
        });
        return improvements;
      }
    } catch {
      // LLM 失败，回退到规则
    }
  }

  // 规则回退：添加默认 Fallback
  const updated = content.trimEnd() + "\n\n" + DEFAULT_FALLBACK;
  fs.writeFileSync(safetyMdPath, updated, "utf-8");
  improvements.push({
    id: "E010",
    category: "safety",
    description: "safety.md 已补充 Fallback Logic（规则生成）",
    severity: "info",
    autoFixable: true,
    applied: true,
    before: content,
    after: updated,
    file: safetyMdPath,
  });

  return improvements;
}

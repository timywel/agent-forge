/**
 * 自然语言解析器
 * 通过 LLM 从自然语言描述提取 LIAS Manifest
 * 并生成 TypeScript skill skeleton
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { LIASManifest, LIASSkill } from "../../types/ir.js";
import type { ILLMClient } from "../../llm/client.js";
import { NATURAL_LANG_EXTRACT_PROMPT } from "../../llm/prompts.js";

export async function parseNaturalLanguage(
  input: string,
  llmClient: ILLMClient
): Promise<LIASManifest> {
  const text = fs.existsSync(input)
    ? fs.readFileSync(input, "utf-8")
    : input;

  let response;
  try {
    response = await llmClient.chat(
      [{ role: "user", content: `描述:\n${text}` }],
      NATURAL_LANG_EXTRACT_PROMPT
    );
  } catch {
    return fallbackParse(input, text);
  }

  let parsed: Record<string, unknown>;
  try {
    let jsonStr = response.content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`LLM 返回的 JSON 解析失败: ${e instanceof Error ? e.message : String(e)}\n原始内容:\n${response.content}`);
  }

  const metadata = parsed.metadata as Record<string, unknown> ?? {};
  const identity = parsed.identity as Record<string, unknown> ?? {};
  const safety = parsed.safety as Record<string, unknown> | undefined;
  const skillsRaw = (parsed.skills ?? []) as Array<Record<string, unknown>>;

  return {
    metadata: {
      id: String(metadata.id ?? "generated-agent"),
      name: String(metadata.name ?? "生成的 Agent"),
      version: String(metadata.version ?? "1.0.0"),
      description: String(metadata.description ?? text.slice(0, 100)),
    },
    identity: {
      role: String(identity.role ?? metadata.name ?? "Agent"),
      objective: String(identity.objective ?? identity.role ?? "执行用户任务"),
      personality: identity.personality as string | undefined,
      vibe: identity.vibe as string | undefined,
      capabilities: Array.isArray(identity.capabilities) ? identity.capabilities.map(String) : ["通用能力"],
      style: Array.isArray(identity.style) ? identity.style.map(String) : ["专业规范"],
      sop: Array.isArray(identity.sop) ? identity.sop.map(String) : undefined,
      outputFormat: identity.outputFormat as string | undefined,
    },
    safety: {
      prohibited: Array.isArray(safety?.prohibited) ? safety.prohibited.map(String) : ["禁止任何形式的伤害行为"],
      constraints: Array.isArray(safety?.constraints) ? safety.constraints.map(String) : [],
      fallback: Array.isArray(safety?.fallback) ? safety.fallback.map(String) : ["无法满足时请礼貌拒绝"],
    },
    skills: skillsRaw.map(s => ({
      name: String(s.name ?? "skill").toLowerCase().replace(/\s+/g, "-"),
      toolName: String(s.name ?? "skill").replace(/\s+/g, "_").toLowerCase(),
      description: String(s.description ?? ""),
      inputSchema: (s.inputSchema as LIASSkill["inputSchema"]) ?? { type: "object", properties: {}, required: [] },
      handler: s.handler as string | undefined,
      tags: s.tags as string[] | undefined,
    })),
    provider: { type: "baize-loop", model: "claude-sonnet-4-20250514", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    source: { type: "nl", path: input, originalContent: text },
  };
}

function fallbackParse(input: string, text: string): LIASManifest {
  const fileName = path.basename(input, ".md");
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const headings = lines.filter(l => l.startsWith("#")).map(l => l.replace(/^#+\s*/, "").trim());
  const firstHeading = headings[0] ?? fileName;

  return {
    metadata: {
      id: fileName.toLowerCase().replace(/\s+/g, "-"),
      name: firstHeading,
      version: "1.0.0",
      description: text.slice(0, 200),
    },
    identity: {
      role: firstHeading,
      objective: "执行用户任务",
      capabilities: extractCapabilitiesFromText(text),
      style: ["专业规范"],
    },
    safety: {
      prohibited: ["禁止任何形式的伤害行为", "禁止生成恶意代码", "禁止泄露敏感信息"],
      constraints: [],
      fallback: ["无法满足时请礼貌拒绝"],
    },
    skills: [],
    provider: { type: "baize-loop", model: "claude-sonnet-4-20250514", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    source: { type: "nl", path: input, originalContent: text },
  };
}

function extractCapabilitiesFromText(text: string): string[] {
  const capabilities: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const item = trimmed.replace(/^[-*]\s*/, "").trim();
      if (item.length > 5 && !item.startsWith("```")) {
        capabilities.push(item);
      }
    }
  }
  return capabilities.length > 0 ? capabilities : ["通用能力"];
}

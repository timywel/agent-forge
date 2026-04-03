/**
 * DescAccuracyReviewer — 描述准确性评审
 * 权重: 10%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewDescAccuracy(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  // 读取 AGENT.md / agent.yaml 中的描述
  const agentMdPath = path.join(agentDir, "AGENT.md");
  const agentYamlPath = path.join(agentDir, "agent.yaml");
  const systemMdPath = path.join(agentDir, "prompts/system.md");

  let metaDesc = "";
  let metaName = "";
  let systemContent = "";
  let agentYamlData: Record<string, unknown> = {};

  // 从 AGENT.md 提取（YAML 解析失败时从 body table 降级）
  if (fs.existsSync(agentMdPath)) {
    const md = fs.readFileSync(agentMdPath, "utf-8");
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      try {
        const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
        metaName = String(fm.name ?? "");
        metaDesc = String(fm.description ?? "");
      } catch {
        // YAML 解析失败时，从 body 的 Metadata table 提取
        const bodyDesc = md.match(/\|\s*Description\s*\|\s*([^\n|]+)/im);
        if (bodyDesc) metaDesc = bodyDesc[1].trim();
      }
    }
  }

  // 从 agent.yaml 提取
  if (fs.existsSync(agentYamlPath)) {
    try {
      agentYamlData = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
      const m = (agentYamlData.metadata ?? agentYamlData) as Record<string, unknown>;
      if (!metaName) metaName = String(m.name ?? "");
      if (!metaDesc) metaDesc = String(m.description ?? "");
    } catch {}
  }

  // 从 system.md 提取
  if (fs.existsSync(systemMdPath)) {
    systemContent = fs.readFileSync(systemMdPath, "utf-8");
  }

  if (!metaDesc && !systemContent) {
    issues.push({ code: "R060", severity: "error", dimension: "descAccuracy", description: "缺少任何描述信息", location: agentDir, suggestion: "在 AGENT.md 或 agent.yaml 中添加 description" });
    return { dimension: "descAccuracy", score: 0, weight: 10, issues, highlights };
  }

  // 检查元数据描述与 system.md 的一致性
  if (metaDesc && systemContent) {
    const metaWords = new Set(metaDesc.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3));
    const systemWords = new Set(systemContent.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3));

    const intersection = [...metaWords].filter(w => systemWords.has(w));
    const overlap = intersection.length / metaWords.size;

    if (overlap < 0.1) {
      issues.push({
        code: "R061",
        severity: "warning",
        dimension: "descAccuracy",
        description: `AGENT.md 描述与 system.md 内容重叠度低（${Math.round(overlap * 100)}%），可能不一致`,
        location: agentMdPath || agentYamlPath,
        suggestion: "确保 AGENT.md description 与 system.md 实际内容一致",
      });
      score -= 2;
    } else {
      highlights.push(`✅ 描述一致性良好（重叠度 ${Math.round(overlap * 100)}%）`);
    }
  }

  // 检查 agent.yaml / AGENT.md 中 id/name 与目录名的一致性
  const dirName = path.basename(agentDir);
  const expectedId = dirName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

  if (agentYamlData.id || (agentYamlData.metadata && (agentYamlData.metadata as Record<string, unknown>).id)) {
    const yamlId = String((agentYamlData.metadata as Record<string, unknown> | undefined)?.id ?? agentYamlData.id ?? "");
    if (yamlId !== expectedId && yamlId !== dirName) {
      issues.push({
        code: "R062",
        severity: "info",
        dimension: "descAccuracy",
        description: `agent.yaml id "${yamlId}" 与目录名 "${dirName}" 不一致`,
        location: agentYamlPath,
        suggestion: "确认 id 字段与目录名一致",
      });
      score -= 0.5;
    }
  }

  // 检查 description 是否包含过多的"通用"词
  const genericWords = ["agent", "assistant", "帮手", "助手", "tool", "工具", "执行", "task"];
  const genericCount = genericWords.filter(w => metaDesc.toLowerCase().includes(w.toLowerCase())).length;
  if (genericCount >= 3 && metaDesc.length < 50) {
    issues.push({
      code: "R063",
      severity: "warning",
      dimension: "descAccuracy",
      description: "description 过于通用，缺乏具体能力描述",
      location: agentMdPath || agentYamlPath,
      suggestion: "提供更具体的 Agent 能力描述，如专业领域、核心功能等",
    });
    score -= 1.5;
  } else if (metaDesc.length > 50) {
    highlights.push("✅ 描述具体充实");
  }

  // 检查 system.md 中是否有过时的角色描述（如"You are a helpful assistant"）
  if (systemContent && /^(you are|i am|i'm|我是)\s*(a |an |)?(helpful |useful |)\s*(assistant|助手|帮手)/i.test(systemContent.trim())) {
    issues.push({
      code: "R064",
      severity: "warning",
      dimension: "descAccuracy",
      description: "system.md 使用了过于通用的角色开头",
      location: systemMdPath,
      suggestion: "改为更具体的角色描述，如「你是一个 X 领域的专家」",
    });
    score -= 1;
  }

  return {
    dimension: "descAccuracy",
    score: Math.max(0, score),
    weight: 10,
    issues,
    highlights,
  };
}

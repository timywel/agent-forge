/**
 * Workflow 格式解析器
 * 输入: Workflow YAML 文件
 */

import * as fs from "node:fs";
import yaml from "js-yaml";
import type { LIASManifest } from "../../types/ir.js";

export function parseWorkflow(filePath: string): LIASManifest {
  const content = fs.readFileSync(filePath, "utf-8");
  const wf = yaml.load(content) as Record<string, unknown>;

  const name = String(wf.name ?? "workflow-agent");
  const description = String(wf.description ?? "工作流编排 Agent");
  const id = toKebabCase(name);

  // 解析步骤
  const stepsRaw = (wf.steps ?? []) as Array<Record<string, unknown>>;
  const workflowSteps = stepsRaw.map(step => ({
    name: String(step.name ?? ""),
    description: String(step.description ?? step.name ?? ""),
    agent: step.agent ? String(step.agent) : undefined,
    skills: step.skill ? [String(step.skill)] : (step.skills as string[] | undefined),
    condition: step.depends_on
      ? `依赖: ${(step.depends_on as string[]).join(", ")}`
      : step.condition ? String(step.condition) : undefined,
  }));

  // 提取所有涉及的 Agent（用于协作配置）
  const involvedAgents = [...new Set(stepsRaw.map(s => s.agent).filter(Boolean).map(String))];

  // 提取所有 Skill
  const skillNames = [...new Set(stepsRaw.flatMap(s => {
    if (s.skill) return [String(s.skill)];
    if (Array.isArray(s.skills)) return s.skills.map(String);
    return [];
  }))];

  const skills = skillNames.map(sn => ({
    name: toKebabCase(sn),
    toolName: toSnakeCase(sn),
    description: `${sn} 步骤`,
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  }));

  return {
    metadata: {
      id: `${id}-orchestrator`,
      name: `${description} 编排器`,
      version: "1.0.0",
      description,
    },
    identity: {
      role: `${description} 编排器`,
      objective: `编排${description}全流程，协调多个专业 Agent 协作`,
      vibe: "按严格流程执行，确保零遗漏",
      capabilities: [
        `编排${description}全流程`,
        "协调多个专业 Agent 协作",
        "汇总多阶段结果",
      ],
      style: [
        "严格按步骤执行，不跳步",
        "每步完成后输出中间结果",
      ],
    },
    safety: { prohibited: [], constraints: [], fallback: [] },
    skills,
    collaboration: involvedAgents.length > 0 ? {
      handoffsTo: involvedAgents.map(a => ({
        agent: a,
        trigger: `工作流需要 ${a} 执行`,
      })),
    } : undefined,
    source: { type: "workflow", path: filePath, originalContent: content },
  } as LIASManifest;
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
}

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}

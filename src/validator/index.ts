/**
 * LIAS Validator — 规范检验器
 * 验证 Agent 目录是否符合 LIAS（Lightweight Industrial Agent Specification）
 */

import * as path from "node:path";
import type { ValidationResult } from "../types/index.js";
import { validateStructure } from "./rules/structure.js";
import { validateSchema } from "./rules/schema.js";
import { validateIdentity, validateSafety } from "./rules/identity.js";
import { validateSkills } from "./rules/skill.js";
import { validateRuntime } from "./rules/lias.js";
import { validateAgentManifest } from "./rules/agent-manifest.js";
import { formatReport } from "./reporter.js";

export { formatReport };

/**
 * 验证 Agent 目录（LIAS 规范）
 */
export function validate(agentDir: string): ValidationResult {
  const resolvedDir = path.resolve(agentDir);

  // 收集所有验证问题
  const allIssues = [
    ...validateStructure(resolvedDir),
    ...validateSchema(resolvedDir),
    ...validateIdentity(resolvedDir),
    ...validateSafety(resolvedDir),
    ...validateSkills(resolvedDir),
    ...validateRuntime(resolvedDir),
    ...validateAgentManifest(resolvedDir),
  ];

  const errors = allIssues.filter(i => i.severity === "error");
  const warnings = allIssues.filter(i => i.severity === "warning");
  const infos = allIssues.filter(i => i.severity === "info");

  const result: ValidationResult = {
    passed: errors.length === 0,
    agentDir: resolvedDir,
    errors,
    warnings,
    infos,
    summary: `${errors.length} 错误, ${warnings.length} 警告, ${infos.length} 提示`,
  };

  return result;
}

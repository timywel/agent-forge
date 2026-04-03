/**
 * 验证报告生成器
 */

import type { ValidationResult, ValidationIssue } from "../types/index.js";

export function formatReport(result: ValidationResult): string {
  const lines: string[] = [];
  const icon = result.passed ? "✅" : "❌";

  lines.push(`${icon} 验证结果: ${result.agentDir}`);
  lines.push("");

  // 分组输出（按 L 码前缀分组：L001-L009=结构, L010-L019=Schema, L020-L029=Skill, L040-L049=Identity, L050-L059=Safety, L060-L099=Runtime）
  const sections: Array<{ title: string; issues: ValidationIssue[] }> = [
    { title: "结构验证", issues: result.errors.concat(result.warnings, result.infos).filter(i => /^L00[1-9]$/.test(i.code)) },
    { title: "Schema 验证", issues: result.errors.concat(result.warnings, result.infos).filter(i => /^L01[0-9]$/.test(i.code)) },
    { title: "Skill 验证", issues: result.errors.concat(result.warnings, result.infos).filter(i => /^L02[0-9]$/.test(i.code)) },
    { title: "Identity 验证", issues: result.errors.concat(result.warnings, result.infos).filter(i => /^L04[0-9]$/.test(i.code)) },
    { title: "Safety 验证", issues: result.errors.concat(result.warnings, result.infos).filter(i => /^L05[0-9]$/.test(i.code)) },
    { title: "Runtime 验证", issues: result.errors.concat(result.warnings, result.infos).filter(i => /^L06[0-9]$/.test(i.code)) },
  ];
  const usedCodes = new Set(sections.flatMap(s => s.issues.map(i => i.code)));
  const otherIssues = result.errors.concat(result.warnings, result.infos).filter(i => !usedCodes.has(i.code));
  if (otherIssues.length > 0) {
    sections.push({ title: "其他验证", issues: otherIssues });
  }

  for (const section of sections) {
    if (section.issues.length === 0) {
      lines.push(`${section.title}:`);
      lines.push(`  ✅ 全部通过`);
    } else {
      lines.push(`${section.title}:`);
      for (const issue of section.issues) {
        const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
        lines.push(`  ${icon} [${issue.code}] ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`     💡 ${issue.suggestion}`);
        }
      }
    }
    lines.push("");
  }

  lines.push(`结果: ${result.passed ? "通过" : "未通过"} (${result.errors.length} 错误, ${result.warnings.length} 警告, ${result.infos.length} 提示)`);

  return lines.join("\n");
}

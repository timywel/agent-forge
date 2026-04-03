/**
 * LIAS Consistency 质量分析器
 * 评估命名一致性和导出匹配
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Improvement } from "../../types/common.js";

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function analyzeConsistency(agentDir: string): { score: number; improvements: Improvement[] } {
  const improvements: Improvement[] = [];
  let score = 100;

  const skillsDir = path.join(agentDir, "skills");
  if (!fs.existsSync(skillsDir)) {
    return { score: 100, improvements: [] };
  }

  // 检查 skills/ 下文件名一致性
  let skillFiles: string[];
  try {
    skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith(".ts") && f !== "index.ts");
  } catch {
    return { score: 50, improvements: [{ id: "CN001", category: "consistency", description: "无法读取 skills 目录", severity: "error", autoFixable: false, applied: false }] };
  }

  for (const file of skillFiles) {
    const name = file.replace(/\.ts$/, "");
    if (!KEBAB_CASE.test(name)) {
      score -= 5;
      improvements.push({ id: `CN010-${name}`, category: "consistency", description: `文件名不符合 kebab-case: ${file}`, severity: "warning", autoFixable: false, applied: false, file: path.join(skillsDir, file) });
    }
  }

  // index.ts 导出匹配检查
  const indexPath = path.join(skillsDir, "index.ts");
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    for (const file of skillFiles) {
      const name = file.replace(/\.ts$/, "");
      const snakeName = name.replace(/-/g, "_");
      if (!indexContent.includes(snakeName) && !indexContent.includes(name)) {
        score -= 5;
        improvements.push({ id: `CN020-${name}`, category: "consistency", description: `skills/index.ts 未引用: ${file}`, severity: "warning", autoFixable: true, applied: false, file: indexPath });
      }
    }
  }

  return { score: Math.max(0, score), improvements };
}

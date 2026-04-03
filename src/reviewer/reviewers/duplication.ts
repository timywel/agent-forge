/**
 * DuplicationReviewer — 重复冗余检测
 * 权重: 5%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

export function reviewDuplication(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  const systemMdPath = path.join(agentDir, "prompts/system.md");
  const safetyMdPath = path.join(agentDir, "prompts/safety.md");

  let systemContent = "";
  let safetyContent = "";

  if (fs.existsSync(systemMdPath)) {
    systemContent = fs.readFileSync(systemMdPath, "utf-8");
  }
  if (fs.existsSync(safetyMdPath)) {
    safetyContent = fs.readFileSync(safetyMdPath, "utf-8");
  }

  const combinedContent = systemContent + "\n" + safetyContent;

  if (!combinedContent.trim()) {
    issues.push({ code: "R070", severity: "info", dimension: "duplication", description: "无内容可检查", location: agentDir });
    return { dimension: "duplication", score: 10, weight: 5, issues, highlights };
  }

  // 1. 检测过长的 Objective（单行超过 200 字符）
  const objectiveMatch = combinedContent.match(/(?:objective|目标|职责)[:：]\s*(.+?)(?:\n|$)/i);
  if (objectiveMatch && objectiveMatch[1].length > 200) {
    issues.push({
      code: "R071",
      severity: "warning",
      dimension: "duplication",
      description: `Objective 过长（${objectiveMatch[1].length} 字符），可能包含过多细节`,
      location: systemMdPath,
      suggestion: "精简 Objective 为 1-3 句话，保留核心职责",
    });
    score -= 1;
  }

  // 2. 检测分号列表（过度列表化）
  const semicolonLists = combinedContent.match(/[^。\.]\s*;\s*[^;]{10,50}(?:;|$)/g) ?? [];
  if (semicolonLists.length > 3) {
    issues.push({
      code: "R072",
      severity: "info",
      dimension: "duplication",
      description: `检测到 ${semicolonLists.length} 处使用分号分隔的列表`,
      location: systemMdPath,
      suggestion: "将分号分隔的列表改为 Markdown 列表格式（- item）",
    });
    score -= 0.5;
  }

  // 3. 检测重复行
  const lines = combinedContent.split("\n").map(l => l.trim()).filter(l => l.length > 20 && !l.startsWith("#") && !l.startsWith("```"));
  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    // 归一化：去除粗体/斜体标记后比较
    const normalized = line.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^[-*]\s*/, "");
    const existing = lineCounts.get(normalized) ?? 0;
    lineCounts.set(normalized, existing + 1);
  }

  const duplicateLines = [...lineCounts.entries()].filter(([_, count]) => count >= 2);
  if (duplicateLines.length > 0) {
    for (const [line, count] of duplicateLines.slice(0, 3)) {
      if (line.length < 10) continue;
      issues.push({
        code: "R073",
        severity: "warning",
        dimension: "duplication",
        description: `"${line.slice(0, 50)}${line.length > 50 ? "..." : ""}" 在文档中出现 ${count} 次`,
        location: systemMdPath,
        suggestion: "移除重复内容或合并相同段落",
      });
      score -= 0.5;
    }
  }

  // 4. 检测重复章节标题
  const headings = combinedContent.match(/^##?\s+(.+)/gm) ?? [];
  const headingCounts = new Map<string, number>();
  for (const h of headings) {
    const text = h.replace(/^##?\s+/, "").trim().toLowerCase();
    headingCounts.set(text, (headingCounts.get(text) ?? 0) + 1);
  }
  const duplicateHeadings = [...headingCounts.entries()].filter(([_, count]) => count >= 2);
  if (duplicateHeadings.length > 0) {
    issues.push({
      code: "R074",
      severity: "info",
      dimension: "duplication",
      description: `${duplicateHeadings.length} 个章节标题重复`,
      location: systemMdPath,
      suggestion: "合并重复的章节",
    });
    score -= 0.3;
  }

  // 5. 检测相邻的相似段落
  const paragraphs = combinedContent.split(/\n\n+/).filter(p => p.trim().length > 100);
  for (let i = 0; i < paragraphs.length - 1; i++) {
    const p1Words = new Set(paragraphs[i].toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3));
    const p2Words = new Set(paragraphs[i + 1].toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3));
    const intersection = [...p1Words].filter(w => p2Words.has(w));
    const overlap = intersection.length / Math.max(p1Words.size, p2Words.size);
    if (overlap > 0.6 && paragraphs[i].length > 100 && paragraphs[i + 1].length > 100) {
      issues.push({
        code: "R075",
        severity: "info",
        dimension: "duplication",
        description: `段落 ${i + 1} 和 ${i + 2} 内容高度相似（重叠度 ${Math.round(overlap * 100)}%）`,
        location: systemMdPath,
        suggestion: "合并或区分相似段落内容",
      });
      score -= 0.5;
    }
  }

  if (issues.length === 0) {
    highlights.push("✅ 无明显重复冗余内容");
  }

  return {
    dimension: "duplication",
    score: Math.max(0, score),
    weight: 5,
    issues,
    highlights,
  };
}

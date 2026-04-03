/**
 * DomainFitnessReviewer — 领域适配评审
 * 权重: 10%
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { DimensionScore, ReviewIssue } from "../../types/review.js";

// 已知的 Agent 分类目录 -> 领域 映射
const CATEGORY_DOMAIN_MAP: Record<string, string> = {
  academic: "academic",
  design: "design",
  engineering: "engineering",
  "game-development": "game-development",
  integrations: "integrations",
  marketing: "marketing",
  "paid-media": "paid-media",
  product: "product",
  "project-management": "project-management",
  sales: "sales",
  "spatial-computing": "spatial-computing",
  specialized: "specialized",
  support: "support",
  testing: "testing",
};

export function reviewDomainFitness(agentDir: string): DimensionScore {
  const issues: ReviewIssue[] = [];
  const highlights: string[] = [];
  let score = 10;

  // 从路径提取分类目录
  const parts = agentDir.split(path.sep);
  const agencyIdx = parts.findIndex(p => p === "agency-agents");
  const categoryDir = agencyIdx >= 0 ? parts[agencyIdx + 1] : null;

  // 读取 AGENT.md 或 agent.yaml 中的 domain.primary
  let declaredDomain: string | null = null;
  const agentMdPath = path.join(agentDir, "AGENT.md");
  const agentYamlPath = path.join(agentDir, "agent.yaml");

  if (fs.existsSync(agentMdPath)) {
    try {
      const md = fs.readFileSync(agentMdPath, "utf-8");
      const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
        const domain = fm.domain as Record<string, unknown> | undefined;
        if (domain) {
          declaredDomain = String(domain.primary ?? domain.domain ?? "");
        }
      }
      // YAML 解析失败时，从 body 中的 Domain table 提取
      if (!declaredDomain) {
        const bodyMatch = md.match(/##\s*Domain\s*[\s\S]*?\|\s*Field\s*\|\s*Value\s*\|[\s\S]*?primary\s*\|\s*([^\s|]+)/im);
        if (bodyMatch) declaredDomain = bodyMatch[1].trim();
      }
    } catch {}
  } else if (fs.existsSync(agentYamlPath)) {
    try {
      const yamlData = yaml.load(fs.readFileSync(agentYamlPath, "utf-8")) as Record<string, unknown>;
      const meta = (yamlData.metadata ?? yamlData) as Record<string, unknown>;
      const domains = meta.domains ?? meta.domain;
      if (typeof domains === "string") {
        declaredDomain = domains;
      } else if (Array.isArray(domains) && domains.length > 0) {
        declaredDomain = String(domains[0]);
      } else if (typeof domains === "object" && domains !== null) {
        const d = domains as Record<string, unknown>;
        declaredDomain = String(d.primary ?? d.domain ?? "");
      }
    } catch {}
  }

  // 从 system.md 提取能力关键词
  const systemMdPath = path.join(agentDir, "prompts/system.md");
  let capabilityKeywords: string[] = [];
  if (fs.existsSync(systemMdPath)) {
    const content = fs.readFileSync(systemMdPath, "utf-8");
    capabilityKeywords = extractKeywords(content);
  }

  // 匹配度评估
  if (categoryDir) {
    const mappedDomain = CATEGORY_DOMAIN_MAP[categoryDir] ?? categoryDir;

    if (declaredDomain) {
      // domain.primary 与目录名一致
      const normalizedDeclared = declaredDomain.toLowerCase().replace(/[-_]/g, "");
      const normalizedMapped = mappedDomain.toLowerCase().replace(/[-_]/g, "");
      if (normalizedDeclared === normalizedMapped || normalizedDeclared.includes(normalizedMapped) || normalizedMapped.includes(normalizedDeclared)) {
        highlights.push(`✅ 领域标签与分类目录一致: ${declaredDomain}`);
      } else {
        issues.push({
          code: "R050",
          severity: "warning",
          dimension: "domainFitness",
          description: `声明的领域 "${declaredDomain}" 与分类目录 "${categoryDir}" 不匹配`,
          location: agentMdPath || agentYamlPath,
          suggestion: "确认 domain.primary 与 Agent 实际分类一致",
        });
        score -= 2;
      }
    } else {
      issues.push({
        code: "R051",
        severity: "info",
        dimension: "domainFitness",
        description: `Agent 位于 "${categoryDir}" 目录但未声明领域`,
        location: agentDir,
        suggestion: "在 AGENT.md 或 agent.yaml 中添加 domain.primary 字段",
      });
      score -= 1;
    }

    // 检查 capabilities 是否与领域匹配
    if (capabilityKeywords.length > 0) {
      const domainRelatedKeywords = getDomainKeywords(mappedDomain);
      const matchCount = capabilityKeywords.filter(k => domainRelatedKeywords.some(dk => k.includes(dk) || dk.includes(k))).length;
      if (matchCount > 0) {
        highlights.push(`✅ 能力关键词与领域相关（${matchCount}/${capabilityKeywords.length} 匹配）`);
      } else if (capabilityKeywords.length >= 3) {
        issues.push({
          code: "R052",
          severity: "info",
          dimension: "domainFitness",
          description: "能力关键词与声明领域可能不匹配",
          location: systemMdPath,
          suggestion: "确认 capabilities 描述与领域标签一致",
        });
        score -= 0.5;
      }
    }
  } else {
    // 无分类目录时
    if (!declaredDomain) {
      issues.push({
        code: "R053",
        severity: "info",
        dimension: "domainFitness",
        description: "无法从路径确定领域分类，且未声明 domain.primary",
        location: agentDir,
        suggestion: "在 AGENT.md 或 agent.yaml 中添加 domain.primary 字段",
      });
      score -= 0.5;
    }
  }

  return {
    dimension: "domainFitness",
    score: Math.max(0, score),
    weight: 10,
    issues,
    highlights,
  };
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  // 提取 ## 标题词
  const headings = text.match(/^##\s+(.+)/gm) ?? [];
  for (const h of headings) {
    const word = h.replace(/^##\s+/, "").trim();
    if (word.length > 2) keywords.push(word.toLowerCase());
  }
  // 提取 bullet list 中的关键词
  const bullets = text.match(/^\s*[-*]\s+([^:\n]{3,50})/gm) ?? [];
  for (const b of bullets) {
    const word = b.replace(/^\s*[-*]\s+/, "").replace(/[:：].*$/, "").trim();
    if (word.length > 2) keywords.push(word.toLowerCase());
  }
  return [...new Set(keywords)].slice(0, 20);
}

function getDomainKeywords(domain: string): string[] {
  const domainKeywordMap: Record<string, string[]> = {
    academic: ["research", "论文", "学术", "分析", "文献", "study", "research"],
    design: ["design", "设计", "ui", "ux", "interface", "figma", "sketch", "视觉"],
    engineering: ["代码", "开发", "code", "program", "api", "database", "架构", "engineer"],
    marketing: ["marketing", "推广", "content", "seo", "广告", "增长", "tiktok", "社交媒体"],
    support: ["support", "客服", "support", "帮助", "respond", "ticket", "issue"],
    sales: ["sales", "销售", "客户", "crm", "leads", "revenue", "pipeline"],
    product: ["product", "产品", "roadmap", "feature", "需求", "用户研究"],
    testing: ["test", "测试", "qa", "bug", "自动化", "单元测试", "integration"],
    game: ["game", "游戏", "unity", "unreal", "物理", "关卡"],
    specialized: ["specialized", "专业", "领域", "expert"],
    integrations: ["integration", "集成", "api", "webhook", "connector", "zapier"],
  };

  const lower = domain.toLowerCase().replace(/[-_]/g, "");
  for (const [key, words] of Object.entries(domainKeywordMap)) {
    if (key.includes(lower) || lower.includes(key)) return words;
  }
  return [];
}

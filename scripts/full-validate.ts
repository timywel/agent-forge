/**
 * 全面验证统计
 */
import { validate } from "../src/validator/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

const TEST_DIR = "/home/timywel/AI_Product/规范/test";

const categoryStats: Record<string, { total: number; errors: number; warnings: number }> = {};

const categories = fs.readdirSync(TEST_DIR);
for (const cat of categories) {
  const catDir = path.join(TEST_DIR, cat);
  if (!fs.statSync(catDir).isDirectory()) continue;

  const agents = fs.readdirSync(catDir);
  let catErrors = 0;
  let catWarnings = 0;

  for (const agent of agents) {
    const agentDir = path.join(catDir, agent);
    if (!fs.statSync(agentDir).isDirectory()) continue;

    const result = validate(agentDir);
    catErrors += result.errors.length;
    catWarnings += result.warnings.length;
  }

  categoryStats[cat] = { total: agents.length, errors: catErrors, warnings: catWarnings };
}

let grandErrors = 0;
let grandWarnings = 0;
console.log("\n分类 | Agent数 | 错误 | 警告");
console.log("---|---|---|---");
for (const [cat, stats] of Object.entries(categoryStats)) {
  console.log(`${cat} | ${stats.total} | ${stats.errors} | ${stats.warnings}`);
  grandErrors += stats.errors;
  grandWarnings += stats.warnings;
}
console.log("---|---|---|---");
console.log(`总计 | ${Object.values(categoryStats).reduce((s, v) => s + v.total, 0)} | ${grandErrors} | ${grandWarnings}`);

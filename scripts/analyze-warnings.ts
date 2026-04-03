/**
 * 警告详细分析
 */
import { validate } from "../src/validator/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

const TEST_DIR = "/home/timywel/AI_Product/规范/test";

const warningCounts: Record<string, number> = {};
const warningDetails: Record<string, Array<{ agent: string; file?: string; msg: string }>> = {};

const categories = fs.readdirSync(TEST_DIR);
let total = 0;

for (const cat of categories) {
  const catDir = path.join(TEST_DIR, cat);
  if (!fs.statSync(catDir).isDirectory()) continue;

  const agents = fs.readdirSync(catDir);
  for (const agent of agents) {
    const agentDir = path.join(catDir, agent);
    if (!fs.statSync(agentDir).isDirectory()) continue;
    total++;

    const result = validate(agentDir);
    const relPath = `${cat}/${agent}`;

    for (const w of result.warnings) {
      const key = `${w.code}: ${w.message.split("\n")[0].slice(0, 80)}`;
      if (!warningCounts[key]) {
        warningCounts[key] = 0;
        warningDetails[key] = [];
      }
      warningCounts[key]++;
      warningDetails[key].push({ agent: relPath, file: w.file, msg: w.message });
    }
  }
}

// 按数量排序
const sorted = Object.entries(warningCounts).sort((a, b) => b[1] - a[1]);

console.log(`总计: ${total} 个 Agent，${sorted.reduce((s, v) => s + v[1], 0)} 个警告\n`);

for (const [key, count] of sorted) {
  const pct = ((count / total) * 100).toFixed(1);
  console.log(`[${count}] (${pct}%) ${key}`);
}

console.log(`\n前 3 类警告详情：`);
for (let i = 0; i < Math.min(3, sorted.length); i++) {
  const [key] = sorted[i];
  console.log(`\n--- ${key} ---`);
  for (const detail of warningDetails[key].slice(0, 3)) {
    console.log(`  ${detail.agent}`);
  }
  if (warningDetails[key].length > 3) {
    console.log(`  ... 还有 ${warningDetails[key].length - 3} 个`);
  }
}

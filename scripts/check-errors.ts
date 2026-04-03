/**
 * 检查剩余错误
 */
import { validate } from "../src/validator/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

const TEST_DIR = "/home/timywel/AI_Product/规范/test";

const categories = fs.readdirSync(TEST_DIR);
for (const cat of categories) {
  const catDir = path.join(TEST_DIR, cat);
  if (!fs.statSync(catDir).isDirectory()) continue;

  const agents = fs.readdirSync(catDir);
  for (const agent of agents) {
    const agentDir = path.join(catDir, agent);
    if (!fs.statSync(agentDir).isDirectory()) continue;

    const result = validate(agentDir);
    if (result.errors.length > 0) {
      console.log(`\n=== ${cat}/${agent} ===`);
      for (const e of result.errors) {
        console.log(`  ERROR ${e.code}: ${e.message}`);
        if (e.file) console.log(`    File: ${e.file}`);
      }
    }
  }
}

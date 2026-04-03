/**
 * 清理孤儿内容：删除 ## SOP 和 ## Capabilities 之间的所有非数字开头行
 */
import * as fs from "node:fs";
import * as path from "node:path";

const TEST_DIR = "/home/timywel/AI_Product/规范/test";
const agents = [
  "design/design-visual-storyteller",
  "sales/sales-pipeline-analyst",
  "specialized/government-digital-presales-consultant",
  "specialized/study-abroad-advisor",
];

for (const agent of agents) {
  const filePath = path.join(TEST_DIR, agent, "prompts", "system.md");
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const sopLineIdx = lines.findIndex((l) => /^## SOP/i.test(l.trim()));
  const capLineIdx = lines.findIndex((l) => /^## Capabilities/i.test(l.trim()));

  if (sopLineIdx === -1 || capLineIdx === -1) {
    console.log(`${agent}: 未找到 SOP/Capabilities 行`);
    continue;
  }

  const toDelete: number[] = [];
  for (let i = sopLineIdx + 1; i < capLineIdx; i++) {
    const l = lines[i].trim();
    // 保留数字开头的 SOP 步骤，删除其余
    if (l && !/^\d+\./.test(l)) {
      toDelete.push(i);
    }
  }

  if (toDelete.length === 0) {
    console.log(`${agent}: 无孤儿行，跳过`);
    continue;
  }

  const newLines = lines.filter((_, i) => !toDelete.includes(i));
  fs.writeFileSync(filePath, newLines.join("\n"), "utf-8");
  console.log(`${agent}: 删除行 ${toDelete.map(i => i + 1).join(",")} (共${toDelete.length}行) → ${newLines.length} 行`);
}

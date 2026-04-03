/**
 * 修复 4 个被 rule-based SOP 插入逻辑破坏的 system.md
 * 旧逻辑：SOP 被插入到 Identity 章节中间，导致 ## Objective 被截断为 ## O
 * 修复：1) 补全 ## Objective 标题  2) 删除孤儿内容行
 */
import * as fs from "node:fs";
import * as path from "node:path";

const TEST_DIR = "/home/timywel/AI_Product/规范/test";

const corrupted = [
  "design/design-visual-storyteller",
  "sales/sales-pipeline-analyst",
  "specialized/government-digital-presales-consultant",
  "specialized/study-abroad-advisor",
];

for (const agent of corrupted) {
  const filePath = path.join(TEST_DIR, agent, "prompts", "system.md");
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // 找到被破坏的 ## O / ## 行的索引
  const badLineIdx = lines.findIndex((l, i) =>
    i > 0 && /^##\s*$/.test(l.trim())
  );

  if (badLineIdx === -1) {
    console.log(`${agent}: 未找到损坏行，跳过`);
    continue;
  }

  console.log(`${agent}: 找到损坏行 #${badLineIdx + 1}: "${lines[badLineIdx]}"`);

  // 找到 ## SOP 行的索引（应该在 badLineIdx + 1）
  const sopLineIdx = lines.findIndex((l, i) => i > badLineIdx && /^## SOP/i.test(l.trim()));
  if (sopLineIdx === -1) {
    console.log(`${agent}: 未找到 ## SOP 行`);
    continue;
  }

  // 收集孤儿内容行：
  // 1. 以 "Objective" 结尾的行（被截断的原始 Objective 内容）
  // 2. 非空、非##、非列表项的内容（紧跟在截断行后面的长段落）
  const orphanLines: number[] = [];
  for (let i = badLineIdx + 1; i < sopLineIdx; i++) {
    const l = lines[i].trim();
    // 以 Objective 结尾的是截断行
    if (l && /Objective$/i.test(l)) {
      orphanLines.push(i);
    }
  }
  // 追加 sopLineIdx 之后到下一个 ## 之前的所有非##内容（孤儿段落）
  if (sopLineIdx !== -1) {
    for (let i = sopLineIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (/^##/.test(l)) break;
      if (l) orphanLines.push(i);
    }
  }

  console.log(`  孤儿行索引: [${orphanLines.join(", ")}]`);

  // 构建新的 Objective 内容：取孤儿内容的第一部分（分号分隔）
  let objContent = "";
  if (orphanLines.length > 0) {
    // 取孤儿内容的第一行，去掉末尾的 "Objective" 单词（它是截断的残留）
    objContent = lines[orphanLines[0]].trim().replace(/\s*Objective$/i, "").trim();
  }

  // 新的 ## Objective 行
  const newObjLine = objContent ? `## Objective\n\n${objContent}` : "## Objective";

  // 重建行数组
  const newLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === badLineIdx) {
      // 替换损坏的标题为完整的 ## Objective
      newLines.push(newObjLine);
    } else if (orphanLines.includes(i)) {
      // 跳过孤儿内容行
      continue;
    } else {
      newLines.push(lines[i]);
    }
  }

  const updated = newLines.join("\n");
  fs.writeFileSync(filePath, updated, "utf-8");
  console.log(`  修复完成：替换 "## O" → "## Objective"，删除 ${orphanLines.length} 行孤儿内容`);
}

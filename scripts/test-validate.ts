/**
 * 详细验证报告
 */
import { validate } from "../src/validator/index.js";
import { formatReport } from "../src/validator/index.js";

const agents = [
  "/home/timywel/AI_Product/规范/test/specialized/specialized-mcp-builder",
  "/home/timywel/AI_Product/规范/test/marketing/marketing-content-creator",
  "/home/timywel/AI_Product/规范/test/game-development/unity-architect",
  "/home/timywel/AI_Product/规范/test/engineering/engineering-frontend-developer",
];

for (const agent of agents) {
  const result = validate(agent);
  const name = agent.split("/").slice(-2).join("/");
  console.log(`\n=== ${name} ===`);
  console.log(`Errors: ${result.errors.length}, Warnings: ${result.warnings.length}, Infos: ${result.infos.length}`);
  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const w of result.warnings) {
      console.log(`  ${w.code}: ${w.message}`);
    }
  }
  if (result.infos.length > 0) {
    console.log("Infos:");
    for (const i of result.infos) {
      console.log(`  ${i.code}: ${i.message}`);
    }
  }
}

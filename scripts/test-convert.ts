/**
 * 测试单个 Agent 转换
 */
import { convert } from "../src/converter/index.js";
import { detectFormat } from "../src/converter/detector.js";
import { DEFAULT_FORGE_CONFIG } from "../src/types/common.js";

const input = "/home/timywel/文档/obsidian/Wel的AI工坊/03_Resources-资源/11_agent/agency-agents/engineering/engineering-frontend-developer.md";
const output = "/tmp/test-convert/engineering-frontend-developer";

const format = detectFormat(input);
console.log("Format:", format);

const config = { ...DEFAULT_FORGE_CONFIG, verbose: true, dryRun: false };
const result = await convert({
  input,
  output,
  skipValidation: true,
  config,
});

console.log("Success:", result.success);
console.log("Files:", result.filesGenerated.length);
console.log("Errors:", result.errors);
if (result.validation) {
  console.log("Validation errors:", result.validation.errors.length);
  console.log("Validation warnings:", result.validation.warnings.length);
}

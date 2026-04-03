/**
 * AGENT Converter — 转换器主入口
 * 将各种格式转换为 LIAS（Lightweight Industrial Agent Specification）标准项目
 */

import * as path from "node:path";
import type { ConversionResult, SourceFormat, ForgeConfig } from "../types/index.js";
import type { LIASManifest } from "../types/ir.js";
import { detectFormat, formatLabel } from "./detector.js";
import { generate } from "./generator.js";
import { validate } from "../validator/index.js";
import { createLLMClient } from "../llm/client.js";

// 解析器导入
import { parseBAS } from "./parsers/bas.js";
import { parseAgentMd } from "./parsers/agent-md.js";
import { parseLA } from "./parsers/la.js";
import { parseWorkflow } from "./parsers/workflow.js";
import { parsePlugin } from "./parsers/plugin.js";
import { parseNaturalLanguage } from "./parsers/natural-lang.js";
import { parseOpenAPI } from "./parsers/openapi.js";
import { parseMCP } from "./parsers/mcp.js";
import { parseAgentManifest } from "./parsers/agent-manifest.js";

export { detectFormat, formatLabel };

export interface ConvertOptions {
  input: string;
  output: string;
  format?: SourceFormat;
  skipValidation?: boolean;
  config: {
    llm: { baseUrl: string; model: string; maxTokens: number; temperature: number; apiKey?: string };
    verbose: boolean;
    dryRun: boolean;
  };
}

/**
 * 执行转换
 */
export async function convert(options: ConvertOptions): Promise<ConversionResult> {
  const { input, output, config } = options;
  const inputPath = path.resolve(input);
  const outputDir = path.resolve(output);

  // 1. 检测格式
  const format = options.format ?? detectFormat(inputPath);
  if (format === "unknown") {
    return {
      success: false,
      outputDir,
      sourceFormat: format,
      filesGenerated: [],
      errors: [`无法识别输入格式: ${inputPath}`],
    };
  }

  if (config.verbose) {
    console.log(`检测到格式: ${formatLabel(format)}`);
  }

  // 2. 解析为 LIAS Manifest
  let ir: LIASManifest;
  try {
    ir = await parse(inputPath, format, config);
  } catch (e) {
    return {
      success: false,
      outputDir,
      sourceFormat: format,
      filesGenerated: [],
      errors: [`解析失败: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (config.verbose) {
    console.log(`解析完成: ${ir.metadata.id} (${ir.skills.length} skills)`);
  }

  // 3. 生成 LIAS 目录
  if (config.dryRun) {
    return {
      success: true,
      outputDir,
      sourceFormat: format,
      filesGenerated: ["(dry-run: 未实际生成)"],
    };
  }

  let filesGenerated: string[];
  try {
    filesGenerated = generate(ir, outputDir);
  } catch (e) {
    return {
      success: false,
      outputDir,
      sourceFormat: format,
      filesGenerated: [],
      errors: [`生成失败: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  // 4. 验证
  let validation;
  if (!options.skipValidation) {
    validation = validate(outputDir);
  }

  return {
    success: true,
    outputDir,
    sourceFormat: format,
    filesGenerated,
    validation,
  };
}

/**
 * 按格式分发到对应解析器
 */
async function parse(
  inputPath: string,
  format: SourceFormat,
  config: ConvertOptions["config"]
): Promise<LIASManifest> {
  switch (format) {
    case "lias":
    case "lias-minimal":
      // LIAS 已是目标格式，尝试重新生成（可用于格式升级）
      return parseLA(inputPath);
    case "bas":
      return parseBAS(inputPath);
    case "agent-md":
      return parseAgentMd(inputPath);
    case "la":
      return parseLA(inputPath);
    case "workflow":
      return parseWorkflow(inputPath);
    case "plugin":
      return parsePlugin(inputPath);
    case "natural-lang": {
      const llmClient = createLLMClient(config.llm);
      return parseNaturalLanguage(inputPath, llmClient);
    }
    case "openapi":
      return parseOpenAPI(inputPath);
    case "mcp":
      return parseMCP(inputPath);
    case "agent-md":
    case "agent-manifest":
      return parseAgentManifest(inputPath);
    default:
      throw new Error(`不支持的格式: ${format}`);
  }
}

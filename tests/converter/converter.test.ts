/**
 * LIAS Converter 测试
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { convert, detectFormat } from "../../src/converter/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "fixtures");

describe("LIAS Detector", () => {
  it("应检测 lias-best 为 lias 格式", () => {
    const format = detectFormat(path.join(FIXTURES, "lias-best"));
    expect(format).toBe("lias");
  });

  it("应检测 lias-worst 为 lias 格式", () => {
    const format = detectFormat(path.join(FIXTURES, "lias-worst"));
    expect(format).toBe("lias");
  });

  it("应检测不存在路径为 unknown", () => {
    const format = detectFormat("/non/existent/path");
    expect(format).toBe("unknown");
  });
});

describe("LIAS Converter (end-to-end)", () => {
  const outputDir = path.join(__dirname, "..", "..", "tmp", "converter-test");

  beforeAll(() => {
    // 清理输出目录
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("应成功转换 lias-best 为 LIAS 项目", async () => {
    const result = await convert({
      input: path.join(FIXTURES, "lias-best"),
      output: outputDir,
      config: {
        llm: { baseUrl: "http://127.0.0.1:15721", model: "claude-sonnet-4-20250514", maxTokens: 8192, temperature: 0.3 },
        verbose: false,
        dryRun: false,
      },
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "main.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "src", "loop.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "src", "provider.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "src", "types.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "prompts", "system.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "prompts", "safety.md"))).toBe(true);
  });
});

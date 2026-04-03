/**
 * LIAS Validator 测试
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../../src/validator/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "fixtures");

describe("LIAS Validator", () => {
  it("lias-best 应通过所有验证", () => {
    const result = validate(path.join(FIXTURES, "lias-best"));
    expect(result.passed).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("lias-worst 应产生验证错误", () => {
    const result = validate(path.join(FIXTURES, "lias-worst"));
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("应检测 LIAS 结构错误", () => {
    const result = validate(path.join(FIXTURES, "lias-worst"));
    const errorCodes = result.errors.map(e => e.code);
    // lias-worst 有 main.ts 但缺少 safety.md, provider.ts, types.ts, 缺少 module type
    expect(errorCodes).toContain("L003"); // safety.md 必须存在
    expect(errorCodes).toContain("L011"); // package.json 缺少 "type": "module"
    expect(errorCodes).toContain("L061"); // src/provider.ts
    expect(errorCodes).toContain("L062"); // src/types.ts
    expect(errorCodes).toContain("L040"); // system.md 缺少 Identity
    expect(errorCodes).toContain("L041"); // system.md 缺少 Objective
  });

  it("应检测 package.json type: module 缺失", () => {
    const result = validate(path.join(FIXTURES, "lias-worst"));
    const codes = result.errors.map(e => e.code).concat(result.warnings.map(e => e.code));
    expect(codes).toContain("L011");
  });
});

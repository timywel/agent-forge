/**
 * LIAS Optimizer 测试
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../../src/optimizer/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "fixtures");

describe("LIAS Optimizer", () => {
  it("lias-best 应获得高评分", () => {
    const result = analyze(path.join(FIXTURES, "lias-best"));
    expect(result.score.overall).toBeGreaterThan(70);
    expect(result.score.identity).toBeGreaterThan(70);
    expect(result.score.skills).toBeGreaterThan(70);
    expect(result.score.safety).toBeGreaterThan(70);
  });

  it("lias-worst 应获得低评分", () => {
    const result = analyze(path.join(FIXTURES, "lias-worst"));
    expect(result.score.overall).toBeLessThan(50);
    expect(result.score.safety).toBeLessThan(50);
  });

  it("应包含所有 LIAS 评分维度", () => {
    const result = analyze(path.join(FIXTURES, "lias-best"));
    expect(result.score).toHaveProperty("identity");
    expect(result.score).toHaveProperty("skills");
    expect(result.score).toHaveProperty("safety");
    expect(result.score).toHaveProperty("runtime");
    expect(result.score).toHaveProperty("completeness");
    expect(result.score).toHaveProperty("overall");
  });
});

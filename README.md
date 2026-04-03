# agent-forge — 白泽 Agent 工具链

> **版本**: 1.0.0 | **日期**: 2026-03-31 | **状态**: 开发中

AGENT Validator + Converter + Optimizer 三位一体工具链，基于 BAIZE-AGENT-SPEC v2 规范。

---

## 架构概览

```
agent-forge/
├── src/
│   ├── index.ts                 # 主入口（API 导出）
│   ├── types/                   # 类型定义
│   │   ├── common.ts            # 公共类型（验证结果、配置等）
│   │   ├── spec.ts              # BAIZE-AGENT-SPEC v2 类型
│   │   └── ir.ts                # 中间表示（IntermediateRepresentation）
│   ├── validator/               # ① AGENT Validator
│   │   ├── index.ts             # 验证器入口
│   │   ├── reporter.ts          # 报告生成
│   │   └── rules/
│   │       ├── structure.ts     # 目录结构验证
│   │       ├── schema.ts        # agent.yaml Schema 验证
│   │       ├── identity.ts      # system.md 内容验证
│   │       └── skill.ts         # Skill 验证
│   ├── converter/               # ② AGENT Converter
│   │   ├── index.ts             # 转换器入口
│   │   ├── detector.ts          # 格式检测器
│   │   ├── generator.ts         # 标准目录生成器
│   │   └── parsers/
│   │       ├── bas.ts           # S1: BAS 格式
│   │       ├── agent-md.ts      # S2: .agent.md
│   │       ├── la.ts            # S3: Lightweight Agent
│   │       ├── workflow.ts      # S4: Workflow YAML
│   │       ├── plugin.ts        # S5: Plugin
│   │       ├── natural-lang.ts  # S6: 自然语言（需 LLM）
│   │       ├── openapi.ts       # S7: OpenAPI/Swagger
│   │       └── mcp.ts           # S8: MCP Server
│   ├── optimizer/               # ③ AGENT Optimizer
│   │   ├── index.ts             # 优化器入口
│   │   ├── analyzers/           # 质量分析
│   │   │   ├── identity.ts      # 身份定义质量
│   │   │   ├── skill.ts         # Skill 质量
│   │   │   ├── completeness.ts  # 完整性
│   │   │   └── consistency.ts   # 一致性
│   │   └── enhancers/           # 自动优化
│   │       ├── identity.ts      # 身份优化（LLM）
│   │       ├── safety.ts        # 安全规则生成（LLM）
│   │       └── skill.ts         # Skill 修复
│   ├── llm/                     # LLM 客户端（槽位设计）
│   │   ├── client.ts            # HTTP 客户端
│   │   └── prompts.ts           # 提示词模板
│   └── cli/
│       └── index.ts             # CLI 入口
├── tests/                       # 测试
└── package.json
```

---

## 三大核心模块

### ① Validator — 规范检验器

验证 Agent 目录是否符合 BAIZE-AGENT-SPEC v2 标准。

**验证检查项 (V001-V053)**:

| 类别 | 检查码 | 说明 | 级别 |
|------|--------|------|------|
| 结构 | V001 | agent.yaml 必须存在 | ERROR |
| 结构 | V002 | prompts/system.md 必须存在 | ERROR |
| 结构 | V003 | safety_rules.md 推荐存在 | WARN |
| Schema | V012 | apiVersion = "baize.io/v2" | ERROR |
| Schema | V015-V020 | metadata 必需字段完整性 | ERROR |
| Identity | V030-V031 | system.md 行数 20-80 | WARN |
| Identity | V032-V033 | system.md 必需章节 | ERROR |
| Identity | V036 | 角色描述不应泛化 | WARN |
| Skill | V042 | Skill 名称 kebab-case | ERROR |
| Skill | V045 | tool.name snake_case | ERROR |
| Skill | V049-V051 | executor.ts 双导出检查 | ERROR |

### ② Converter — 转换器

支持 **8 种输入格式** 自动转换为标准 BaizeAgent 目录：

| 编号 | 格式 | 需要 LLM | 说明 |
|------|------|----------|------|
| S1 | BAS | ❌ | AGENT.md + BAS.yaml |
| S2 | .agent.md | ❌ | Frontmatter Markdown |
| S3 | LA | ❌ | prompts/ + skills/ + src/ |
| S4 | Workflow | ❌ | 多步工作流 YAML |
| S5 | Plugin | ❌ | Claude Plugin |
| S6 | 自然语言 | ✅ | 纯文本描述 |
| S7 | OpenAPI | ❌ | API 定义 |
| S8 | MCP | ❌ | MCP Server |

**转换流程**: 格式检测 → 解析为 IR → 生成标准目录 → 验证

### ③ Optimizer — 优化器

四维质量分析 + 自动/LLM 优化:

| 维度 | 权重 | 说明 |
|------|------|------|
| 身份定义 | 30% | 角色具体性、能力聚焦、风格可操作 |
| Skill 质量 | 25% | 命名规范、Schema 完整、executor 规范 |
| 完整性 | 25% | 必需文件、推荐字段覆盖 |
| 一致性 | 20% | ID/目录名匹配、注册表匹配 |

---

## 使用方式

### CLI 命令

```bash
# ── 验证 ──
npx tsx src/cli/index.ts validate -i ./my-agent/

# ── 转换 ──
npx tsx src/cli/index.ts convert -i ./source/ -o ./output/

# ── 从自然语言创建（需 LLM） ──
npx tsx src/cli/index.ts create -i "安全工程师，擅长代码审计" -o ./agents/security/

# ── 质量分析 ──
npx tsx src/cli/index.ts analyze -i ./my-agent/

# ── 优化 ──
npx tsx src/cli/index.ts optimize -i ./my-agent/
npx tsx src/cli/index.ts optimize -i ./my-agent/ --use-llm

# ── 格式检测 ──
npx tsx src/cli/index.ts detect -i ./some-input/

# ── 显示支持格式 ──
npx tsx src/cli/index.ts formats
```

### API 调用

```typescript
import { validate, convert, analyze, optimize } from "agent-forge";

// 验证
const vResult = validate("./my-agent");
console.log(vResult.passed, vResult.errors);

// 转换
const cResult = await convert({
  input: "./workflow.yaml",
  output: "./agents/my-agent",
  config: DEFAULT_FORGE_CONFIG,
});

// 分析
const aResult = analyze("./my-agent");
console.log(aResult.score.overall); // 0-100

// 优化
const oResult = await optimize({
  agentDir: "./my-agent",
  autoFix: true,
  useLLM: true,
  config: DEFAULT_FORGE_CONFIG,
});
```

---

## LLM 槽位设计

```
┌─────────────────────────────────────┐
│          agent-forge                │
│                                     │
│  Validator: 纯规则，无 LLM         │
│  Converter: S6 自然语言需要 LLM    │
│  Optimizer: 深度优化需要 LLM       │
│                                     │
│  ┌───────────────────┐              │
│  │   LLM Client 槽位  │             │
│  │                   │              │
│  │  测试: 127.0.0.1  │              │
│  │  :15721           │              │
│  │                   │              │
│  │  正式: 外部注入    │             │
│  └───────────────────┘              │
└─────────────────────────────────────┘
```

- **测试阶段**: 调用本地代理 `http://127.0.0.1:15721`
- **正式使用**: 通过 API 接口暴露给 Agent，Agent 连接中间层 LLM API
- **agent-forge 不管理 LLM**: 仅提供 `ILLMClient` 接口，支持注入

---

## 集成方式

### 1. 独立 CLI 工具

```bash
agent-forge validate -i ./agent-dir
agent-forge convert -i ./source -o ./output
```

### 2. baize-loop 集成

```typescript
import { validate, convert, optimize } from "agent-forge";

// 在 baize-loop 流程中调用
const result = await convert({ input, output, config });
```

### 3. 作为 Agent Skill

将 agent-forge 注册为 Harness 可调用的 Skill：

```yaml
# skill.yaml
name: "agent-forge"
tool:
  name: "agent_forge"
  description: "验证、转换、优化 Agent 定义"
  input_schema:
    type: object
    properties:
      action: { type: string, enum: [validate, convert, optimize] }
      input: { type: string }
      output: { type: string }
```

---

## 开发

```bash
npm install          # 安装依赖
npm test             # 运行测试
npm run build        # 构建
npm run dev -- validate -i ./agent  # 开发模式运行
```

---

**基于**: BAIZE-AGENT-SPEC v2 + BAIZE-AGENT-CONVERTER v1
**维护者**: AI Product Lab

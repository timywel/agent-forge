# agent-forge — Agent 评审与优化工具链

> **版本**: 2.0.0 | **日期**: 2026-04-03 | **状态**: 生产就绪 | **维护者**: https://github.com/timywel

`agent-forge` 是一个基于 LIAS（Lightweight Industrial Agent Specification）规范的 Agent 工程化工具。它像一位资深代码审查员，能对任意 Agent 项目进行全方位"体检"——从目录结构、身份定义、安全边界到代码质量、命名规范，9 大维度逐一打分，并自动生成优化方案。

**一句话定位**：让烂 Agent 变好，让好 Agent 变精。

---

### 1. 🔍 Agent 评审团（Review Board）

9 个专业维度对 Agent 项目进行"全身体检"，并行评审 + 量化打分：

| 评审维度 | 权重 | 说明 |
|---|---|---|
| 结构合规 | 15% | main.ts、prompts/、skills/ 等必需文件是否存在 |
| 身份定义 | 20% | Role、Objective、SOP 定义是否清晰完整 |
| 安全规范 | 10% | safety.md 禁止行为是否完备、Fallback 是否有效 |
| SKILL.md | 15% | YAML frontmatter 是否规范、步骤定义是否完整 |
| 代码质量 | 10% | TypeScript 可读性、错误处理、代码健壮性 |
| 领域适配 | 10% | Agent 能力与声明领域是否匹配 |
| 描述准确性 | 10% | AGENT.md 与 system.md 描述是否一致 |
| 重复冗余 | 5% | 检测过长 Objective、分号列表、重复段落 |
| 命名一致性 | 5% | kebab-case 规范执行情况 |

**评分标准**：每维度 0-10 分，权重加权求和。满分 10/10。

### 2. 🔧 批量优化（Batch Optimize）

基于评审报告自动修复问题，省去手动逐个改的麻烦：

- **domain.primary 补全** — 自动从目录路径提取领域
- **safety.md 生成** — 为缺失安全定义的 Agent 补充标准安全红线
- **system.md Identity 补全** — 修复身份定义章节缺失问题
- **agent.yaml id 修正** — 保持 id 与目录名一致

### 3. ⚙️ 运行时生成（Runtime Generate）

根据 LIAS 规范模板，一键生成完整的 Agent 运行时代码骨架：

- `main.ts` — Agent 入口（带 LLM 调用循环）
- `src/types.ts` — 类型定义
- `src/provider.ts` — LLM 提供者配置（支持 Anthropic/OpenAI）
- `src/loop.ts` — Agent 循环逻辑（ReAct 模式）
- `package.json` — 依赖配置
- `tsconfig.json` — TypeScript 配置
- `skills/index.ts` — Skill 工具注册

### 4. 📋 SKILL.md 生成（Skills Generate）

从 `prompts/system.md` 的 Capabilities 章节智能提取技能，自动生成符合 Agent Skills 规范的 SKILL.md 文件：

```
.claude/skills/{skill-name}/SKILL.md
```

每个 Skill 包含：YAML frontmatter（name/description/tools）+ 使用步骤 + 输入输出示例 + 边界情况。

### 5. 🔄 格式迁移（Migrate）

将旧的 `agent.yaml` 格式升级为现代的 `AGENT.md` Markdown 格式，YAML frontmatter + 可读性表格，一目了然：

- 自动提取 description、domain、tags、skills 等元数据
- 支持批量迁移整个 Agent 仓库
- 可选删除旧 `agent.yaml` 文件

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/timywel/agent-forge.git
cd agent-forge

# 安装依赖
npm install

# 验证 Agent 项目
npx tsx src/cli/index.ts validate -i ./test/my-agent/

# 运行评审团
npx tsx scripts/run-review.ts --input ./test/my-agent/ --output reports/

# 批量优化（基于评审报告）
npx tsx scripts/batch-optimize.ts --input reports/agent-review-report-2026-04-03.json --force

# 生成运行时文件
npx tsx scripts/generate-runtime.ts --input ./test/my-agent/ --batch

# 生成 SKILL.md
npx tsx scripts/generate-skills.ts --input ./test/my-agent/ --batch

# 格式迁移
npx tsx src/cli/index.ts migrate --input ./test/my-agent/ --delete
```

---

## 目录结构

```
agent-forge/
├── src/
│   ├── cli/
│   │   ├── index.ts          # CLI 入口（validate, convert, migrate）
│   │   └── migrate.ts        # agent.yaml → AGENT.md 迁移
│   ├── converter/
│   │   ├── index.ts          # 转换器主入口
│   │   ├── detector.ts       # 格式自动检测
│   │   └── parsers/         # 多种格式解析器
│   │       ├── agent-md.ts   # AGENT.md 解析
│   │       ├── agent-manifest.ts  # AGENT.md YAML frontmatter
│   │       └── ...
│   ├── reviewer/
│   │   ├── ReviewBoard.ts    # 评审管理（并行调度 9 个 Reviewer）
│   │   ├── reviewers/        # 9 个专业评审器
│   │   │   ├── structural.ts    # R001-R009 结构合规
│   │   │   ├── identity.ts     # R010-R016 身份定义
│   │   │   ├── safety.ts       # R020-R024 安全规范
│   │   │   ├── skill-spec.ts   # R030-R037 SKILL.md 规范
│   │   │   ├── code-quality.ts # R040-R046 代码质量
│   │   │   ├── domain-fitness.ts # R050-R053 领域适配
│   │   │   ├── desc-accuracy.ts # R060-R064 描述准确性
│   │   │   ├── duplication.ts   # R070-R075 重复冗余
│   │   │   └── naming.ts       # R080-R084 命名一致性
│   │   └── reporters/        # 报告生成器
│   │       ├── markdown.ts   # Markdown 报告
│   │       └── json.ts       # JSON 报告（可被 batch-optimize.ts 消费）
│   ├── validator/
│   │   ├── index.ts         # 验证器入口
│   │   └── rules/
│   │       ├── lias.ts      # LIAS 规范验证（L070-L079）
│   │       ├── identity.ts   # Identity 章节验证
│   │       ├── skill.ts     # Skill 验证
│   │       └── structure.ts  # 目录结构验证
│   ├── types/
│   │   ├── common.ts        # 公共类型
│   │   ├── review.ts        # 评审结果类型定义
│   │   ├── spec.ts         # BAIZE-AGENT-SPEC 类型
│   │   └── ir.ts           # 中间表示类型
│   └── optimizer/           # 优化器（分析 + 自动修复）
├── scripts/
│   ├── run-review.ts       # 评审团入口
│   ├── batch-optimize.ts   # 批量优化（基于 JSON 报告）
│   ├── generate-runtime.ts # 运行时文件生成
│   ├── generate-skills.ts # SKILL.md 生成
│   ├── analyze-issues.ts   # 问题分析脚本
│   └── ...
├── reports/
│   ├── OPTIMIZATION-PLAN.md  # 优化方案文档
│   └── agent-review-report-*.{md,json}  # 评审报告
└── package.json
```

---

## 评审维度详解

### R001-R009 结构合规（权重 15%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R001 | ERROR | 缺少 main.ts 运行时入口 |
| R002 | ERROR | 缺少 prompts/system.md |
| R003 | ERROR | 缺少 prompts/safety.md |
| R004 | ERROR | 缺少 src/ 目录 |
| R006 | ERROR | 缺少 package.json |

### R010-R016 身份定义（权重 20%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R010 | ERROR | system.md 内容为空 |
| R011 | WARNING | Agent 描述缺失或过短 |
| R012 | ERROR | system.md 缺少必需章节 |
| R013 | WARNING | 缺少 Identity 章节 |
| R014 | WARNING | 缺少 Capabilities 章节 |
| R015 | WARNING | Objective 过于泛化 |
| R016 | WARNING | Objective 过长（>200字符） |

### R020-R024 安全规范（权重 10%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R020 | ERROR | 缺少安全定义文件 |
| R021 | WARNING | 缺少禁止行为（Prohibited）定义 |
| R022 | INFO | 禁止行为定义过少（<3项） |
| R023 | WARNING | 缺少 Fallback Logic |
| R024 | WARNING | 安全内容过短 |

### R030-R037 SKILL.md 规范（权重 15%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R030 | INFO | 无 skills/ 目录 |
| R031 | WARNING | skills/ 目录无 SKILL.md |
| R032 | WARNING | SKILL.md 缺少 YAML frontmatter |
| R033 | WARNING | SKILL.md frontmatter YAML 格式错误 |
| R034 | WARNING | SKILL.md 缺少 name 字段 |
| R035 | WARNING | SKILL.md name 不符合 kebab-case |
| R036 | WARNING | SKILL.md description 过短 |
| R037 | INFO | SKILL.md 无编号步骤定义 |

### R040-R046 代码质量（权重 10%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R040 | INFO | 无 TypeScript 文件 |
| R041 | INFO | TypeScript 文件内容过短 |
| R042 | WARNING | 异步代码缺少 try-catch |
| R043 | INFO | console 调用过多 |
| R044 | INFO | 存在 TODO/FIXME |
| R045 | INFO | 文件无有效导出 |
| R046 | INFO | 文件过长（>100行） |

### R050-R053 领域适配（权重 10%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R050 | WARNING | 声明领域与目录不匹配 |
| R051 | INFO | 未声明领域 |
| R052 | INFO | 能力关键词与领域不匹配 |
| R053 | INFO | 无法确定领域且未声明 |

### R060-R064 描述准确性（权重 10%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R060 | ERROR | 缺少任何描述 |
| R061 | WARNING | AGENT.md 与 system.md 重叠度低 |
| R062 | WARNING | id/name 与目录名不一致 |
| R063 | WARNING | 描述过于泛化 |

### R070-R075 重复冗余（权重 5%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R070 | INFO | Objective 过长 |
| R071 | INFO | Objective 包含分号列表 |
| R072 | INFO | 使用分号分隔的列表 |
| R073 | INFO | 存在完全重复的行 |
| R074 | INFO | 存在完全重复的标题 |
| R075 | INFO | 相邻段落内容高度相似 |

### R080-R084 命名一致性（权重 5%）

| 代码 | 严重性 | 说明 |
|---|---|---|
| R080 | ERROR | 目录名不符合 kebab-case |
| R081 | WARNING | AGENT.md/agent.yaml id 不符合规范 |
| R082 | WARNING | skills/ 目录文件名不符合规范 |
| R083 | WARNING | src/ 目录文件名不符合规范 |

---

## AGENT.md 格式规范

### 文件位置

Agent 项目根目录（与 main.ts 同级）

### Frontmatter（结构化字段）

```yaml
---
id: marketing-tiktok-strategist
name: Marketing TikTok Strategist
version: 1.0.0
description: TikTok 病毒式内容创作与增长策略
author: https://github.com/timywel
tags:
  - marketing
  - social-media
  - tiktok
domain:
  primary: marketing
  secondary:
    - social-media
    - content-creation
---
```

### Body（可读性表格）

```markdown
## Metadata

| Field | Value |
|---|---|
| Description | TikTok 病毒式内容创作与增长策略 |
| Tags | marketing, social-media, tiktok |

## Skills

**Required**:
- viral-content-creation
- algorithm-mastery

**Optional**:
- creator-collaboration
```

---

## 评审报告示例

```bash
$ npx tsx scripts/run-review.ts --input ./test/my-agent/ --output reports/

🔍 Agent 评审团启动
   输入路径: ./test/my-agent
   发现 Agent: 79 个

📊 评审完成: 79 个 Agent
   平均评分: 10/10
   问题总数: 0 (0 错误, 0 警告, 0 提示)

🏆 Top 5:
   academic-anthropologist: ▓▓▓▓▓▓▓▓▓▓ 10/10
   academic-geographer: ▓▓▓▓▓▓▓▓▓▓ 10/10
   ...

📄 Markdown 报告: reports/agent-review-report-2026-04-03.md
📊 JSON 报告: reports/agent-review-report-2026-04-03.json
```

---

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npx tsc --noEmit

# 运行测试
npm test

# 构建
npm run build

# 开发模式（热重载）
npm run dev

# 清理 dist
npm run clean
```

---

## 相关规范

- **LIAS** — Lightweight Industrial Agent Specification（主规范）
- **BAIZE-AGENT-SPEC v2** — Agent 定义格式标准
- **Agent Skills** — Skill 工具规范

---

**维护者**: https://github.com/timywel
**许可**: MIT

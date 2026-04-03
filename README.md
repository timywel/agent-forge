# agent-forge

> Version: 2.0.0 | Date: 2026-04-03 | Status: Production Ready

agent-forge is a CLI toolchain for validating, reviewing, optimizing, and generating Agent projects following the LIAS (Lightweight Industrial Agent Specification) standard.

---

## Features

### 1. Review Board

Parallel multi-dimensional review of Agent project structure and quality.

| Dimension | Weight | Description |
|---|---|---|
| Structural Compliance | 15% | Required files: main.ts, prompts/, skills/ |
| Identity Definition | 20% | Role, Objective, SOP clarity and completeness |
| Safety Rules | 10% | Prohibited actions, Fallback logic |
| SKILL.md Spec | 15% | YAML frontmatter, step definitions |
| Code Quality | 10% | TypeScript readability, error handling |
| Domain Fitness | 10% | Capabilities match declared domain |
| Description Accuracy | 10% | AGENT.md and system.md consistency |
| Duplication | 5% | Long objectives, semicolon lists, repeated content |
| Naming Consistency | 5% | kebab-case compliance |

**Scoring**: 0–10 per dimension, weighted sum. Max: 10/10.

### 2. Batch Optimize

Auto-fix issues identified in the review report:

- `domain.primary` completion — extract domain from directory path
- `safety.md` generation — add standard safety rules for missing agents
- `system.md Identity` completion — fix missing identity sections
- `agent.yaml id` alignment — keep id consistent with directory name

### 3. Runtime Generate

Generate complete LIAS-compliant runtime code from a template:

- `main.ts` — Agent entry point
- `src/types.ts` — Type definitions
- `src/provider.ts` — LLM provider config (Anthropic / OpenAI)
- `src/loop.ts` — Agent loop (ReAct pattern)
- `package.json` — Dependencies
- `tsconfig.json` — TypeScript config
- `skills/index.ts` — Skill tool registry

### 4. SKILL.md Generate

Extract capabilities from `prompts/system.md` and generate SKILL.md files:

```
.claude/skills/{skill-name}/SKILL.md
```

Each Skill includes: YAML frontmatter (name/description/tools) + steps + I/O examples + boundaries.

### 5. Format Migrate

Migrate legacy `agent.yaml` format to modern `AGENT.md` Markdown format:

- YAML frontmatter (structured fields)
- Markdown body (human-readable tables)
- Auto-extract description, domain, tags, skills metadata

---

## Quick Start

```bash
git clone https://github.com/timywel/agent-forge.git
cd agent-forge
npm install

# Validate
npx tsx src/cli/index.ts validate -i ./test/my-agent/

# Run review board
npx tsx scripts/run-review.ts --input ./test/my-agent/ --output reports/

# Batch optimize
npx tsx scripts/batch-optimize.ts --input reports/agent-review-report-2026-04-03.json --force

# Generate runtime files
npx tsx scripts/generate-runtime.ts --input ./test/my-agent/ --batch

# Generate SKILL.md
npx tsx scripts/generate-skills.ts --input ./test/my-agent/ --batch

# Migrate format
npx tsx src/cli/index.ts migrate --input ./test/my-agent/ --delete
```

---

## Directory Structure

```
agent-forge/
├── src/
│   ├── cli/
│   │   ├── index.ts          # CLI entry (validate, convert, migrate)
│   │   └── migrate.ts        # agent.yaml → AGENT.md migration
│   ├── converter/
│   │   ├── index.ts          # Converter main entry
│   │   ├── detector.ts       # Format auto-detection
│   │   └── parsers/          # Format parsers
│   │       ├── agent-md.ts   # AGENT.md parser
│   │       ├── agent-manifest.ts
│   │       └── ...
│   ├── reviewer/
│   │   ├── ReviewBoard.ts    # Review orchestration
│   │   ├── reviewers/        # 9 specialized reviewers
│   │   │   ├── structural.ts    # R001-R009
│   │   │   ├── identity.ts     # R010-R016
│   │   │   ├── safety.ts       # R020-R024
│   │   │   ├── skill-spec.ts   # R030-R037
│   │   │   ├── code-quality.ts # R040-R046
│   │   │   ├── domain-fitness.ts # R050-R053
│   │   │   ├── desc-accuracy.ts # R060-R064
│   │   │   ├── duplication.ts   # R070-R075
│   │   │   └── naming.ts       # R080-R084
│   │   └── reporters/        # Report generators
│   │       ├── markdown.ts   # Markdown report
│   │       └── json.ts       # JSON report (consumed by batch-optimize.ts)
│   ├── validator/
│   │   ├── index.ts         # Validator entry
│   │   └── rules/
│   │       ├── lias.ts      # LIAS spec validation (L070-L079)
│   │       ├── identity.ts  # Identity section validation
│   │       ├── skill.ts     # Skill validation
│   │       └── structure.ts # Directory structure validation
│   ├── types/
│   │   ├── common.ts        # Common types
│   │   ├── review.ts        # Review result types
│   │   ├── spec.ts          # BAIZE-AGENT-SPEC types
│   │   └── ir.ts            # IR types
│   └── optimizer/           # Optimizer
├── scripts/
│   ├── run-review.ts        # Review board entry
│   ├── batch-optimize.ts    # Batch optimization
│   ├── generate-runtime.ts  # Runtime generation
│   ├── generate-skills.ts   # SKILL.md generation
│   ├── analyze-issues.ts    # Issue analysis
│   └── ...
├── reports/
│   ├── OPTIMIZATION-PLAN.md
│   └── agent-review-report-*.{md,json}
└── package.json
```

---

## Review Dimensions

### R001-R009 Structural Compliance (Weight: 15%)

| Code | Severity | Description |
|---|---|---|
| R001 | ERROR | main.ts is missing |
| R002 | ERROR | prompts/system.md is missing |
| R003 | ERROR | prompts/safety.md is missing |
| R004 | ERROR | src/ directory is missing |
| R006 | ERROR | package.json is missing |

### R010-R016 Identity Definition (Weight: 20%)

| Code | Severity | Description |
|---|---|---|
| R010 | ERROR | system.md is empty |
| R011 | WARNING | Agent description is missing or too short |
| R012 | ERROR | system.md missing required sections |
| R013 | WARNING | Identity section is missing |
| R014 | WARNING | Capabilities section is missing |
| R015 | WARNING | Objective is too generic |
| R016 | WARNING | Objective is too long (>200 chars) |

### R020-R024 Safety Rules (Weight: 10%)

| Code | Severity | Description |
|---|---|---|
| R020 | ERROR | Safety definition file is missing |
| R021 | WARNING | Prohibited actions are missing |
| R022 | INFO | Fewer than 3 prohibited items defined |
| R023 | WARNING | Fallback Logic is missing |
| R024 | WARNING | Safety content is too short |

### R030-R037 SKILL.md Spec (Weight: 15%)

| Code | Severity | Description |
|---|---|---|
| R030 | INFO | No skills/ directory |
| R031 | WARNING | skills/ has no SKILL.md files |
| R032 | WARNING | SKILL.md missing YAML frontmatter |
| R033 | WARNING | SKILL.md frontmatter has YAML errors |
| R034 | WARNING | SKILL.md missing name field |
| R035 | WARNING | SKILL.md name not in kebab-case |
| R036 | WARNING | SKILL.md description is too short |
| R037 | INFO | SKILL.md has no numbered steps |

### R040-R046 Code Quality (Weight: 10%)

| Code | Severity | Description |
|---|---|---|
| R040 | INFO | No TypeScript files |
| R041 | INFO | TypeScript file content is too short |
| R042 | WARNING | Async code lacks try-catch |
| R043 | INFO | Excessive console calls |
| R044 | INFO | TODO/FIXME comments present |
| R045 | INFO | File has no valid exports |
| R046 | INFO | File is too long (>100 lines) |

### R050-R053 Domain Fitness (Weight: 10%)

| Code | Severity | Description |
|---|---|---|
| R050 | WARNING | Declared domain does not match directory |
| R051 | INFO | No domain declared |
| R052 | INFO | Capability keywords do not match domain |
| R053 | INFO | Cannot determine domain and none declared |

### R060-R064 Description Accuracy (Weight: 10%)

| Code | Severity | Description |
|---|---|---|
| R060 | ERROR | No description found |
| R061 | WARNING | AGENT.md and system.md have low overlap |
| R062 | WARNING | id/name inconsistent with directory name |
| R063 | WARNING | Description is too generic |

### R070-R075 Duplication (Weight: 5%)

| Code | Severity | Description |
|---|---|---|
| R070 | INFO | Objective is too long |
| R071 | INFO | Objective contains semicolon list |
| R072 | INFO | Semicolon-separated list detected |
| R073 | INFO | Identical duplicate lines found |
| R074 | INFO | Identical duplicate headings found |
| R075 | INFO | Adjacent paragraphs are highly similar |

### R080-R084 Naming Consistency (Weight: 5%)

| Code | Severity | Description |
|---|---|---|
| R080 | ERROR | Directory name not in kebab-case |
| R081 | WARNING | AGENT.md/agent.yaml id not compliant |
| R082 | WARNING | skills/ filename not compliant |
| R083 | WARNING | src/ filename not compliant |

---

## AGENT.md Format

### File Location

Agent project root (same level as main.ts)

### Frontmatter

```yaml
---
id: marketing-tiktok-strategist
name: Marketing TikTok Strategist
version: 1.0.0
description: TikTok viral content creation and growth strategy
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

### Body

```markdown
## Metadata

| Field | Value |
|---|---|
| Description | TikTok viral content creation and growth strategy |
| Tags | marketing, social-media, tiktok |

## Skills

**Required**:
- viral-content-creation
- algorithm-mastery

**Optional**:
- creator-collaboration
```

---

## Review Output Example

```bash
$ npx tsx scripts/run-review.ts --input ./test/my-agent/ --output reports/

🔍 Agent Review Board
   Input: ./test/my-agent
   Found: 79 agents

📊 Review complete: 79 agents
   Average score: 10/10
   Issues: 0 (0 errors, 0 warnings, 0 hints)

🏆 Top 5:
   academic-anthropologist: ▓▓▓▓▓▓▓▓▓▓ 10/10
   academic-geographer: ▓▓▓▓▓▓▓▓▓▓ 10/10
   ...

📄 Markdown report: reports/agent-review-report-2026-04-03.md
📊 JSON report: reports/agent-review-report-2026-04-03.json
```

---

## Development

```bash
npm install
npx tsc --noEmit   # Type check
npm test           # Run tests
npm run build      # Build
npm run dev        # Dev mode (hot reload)
npm run clean      # Clean dist
```

---

## Related Standards

- **LIAS** — Lightweight Industrial Agent Specification
- **BAIZE-AGENT-SPEC v2** — Agent definition format standard
- **Agent Skills** — Skill tool specification

---

**Maintainer**: https://github.com/timywel
**License**: MIT

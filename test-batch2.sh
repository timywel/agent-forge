#!/bin/bash
# 批量转换（for 循环避免 subshell 问题）

set -e

AGENT_FORGE="./dist/cli/index.js"
OUT="/home/timywel/AI_Product/规范/test/agent-conversion-v3"
SRC="/home/timywel/AI_Product/agent-lab/agency-agents"

echo "=========================================="
echo "批量转换：agent-forge SKILL.md 新生成器"
echo "=========================================="

rm -rf "$OUT"
mkdir -p "$OUT"

cd /home/timywel/AI_Product/规范/agent/agent-forge

TOTAL=0
TOTAL_SKILLS=0

for src_file in $(find "$SRC" -maxdepth 2 -name "*.md" \
  -not -name "README*" \
  -not -name "CONTRIBUTING*" \
  -not -name "ANALYSIS*" \
  -not -name "CONTRIBUTING_zh-CN*" \
  -not -name "QUICKSTART*" \
  -not -name "LICENSE*" \
  | sort); do

  rel_path="${src_file#$SRC/}"
  category="${rel_path%%/*}"
  filename=$(basename "$src_file" .md)
  out_dir="$OUT/$category/$filename"

  TOTAL=$((TOTAL + 1))

  if node "$AGENT_FORGE" convert agent \
    -i "$src_file" \
    -o "$out_dir" \
    --skip-validation \
    > /dev/null 2>&1; then
    skill_count=$(find "$out_dir/skills" -name "SKILL.md" 2>/dev/null | wc -l)
    TOTAL_SKILLS=$((TOTAL_SKILLS + skill_count))
    echo "[$TOTAL] ✅ $category/$filename ($skill_count skills)"
  else
    echo "[$TOTAL] ❌ $category/$filename"
  fi
done

echo ""
echo "=========================================="
echo "转换完成: $TOTAL agents, $TOTAL_SKILLS skills"
echo "=========================================="

#!/bin/bash
# 批量转换所有 agency-agents 并验证结果

set -e

AGENT_FORGE="./dist/cli/index.js"
SKILL_VALIDATE="python3 -c \"from skill_forge.cli import main; import sys; sys.exit(main(['validate',"

SRC="/home/timywel/AI_Product/agent-lab/agency-agents"
OUT="/home/timywel/AI_Product/规范/test/agent-conversion-v3"
TEMP="/tmp/batch-skill-results.json"

echo "=========================================="
echo "批量转换测试：agent-forge SKILL.md 生成"
echo "=========================================="
echo ""

# 统计
TOTAL=0
AGENT_PASS=0
AGENT_FAIL=0
SKILL_TOTAL=0
SKILL_PASS=0
SKILL_FAIL=0
SKILL_ERROR=0

# 清理旧结果
rm -rf "$OUT"
mkdir -p "$OUT"

# 收集所有 agent .md 文件
find "$SRC" -maxdepth 2 -name "*.md" \
  -not -name "README*" \
  -not -name "CONTRIBUTING*" \
  -not -name "ANALYSIS*" \
  -not -name "CONTRIBUTING_zh-CN*" \
  -not -name "QUICKSTART*" \
  -not -name "LICENSE*" \
  | sort | while read -r src_file; do

  # 计算相对路径和分类
  rel_path="${src_file#$SRC/}"
  category="${rel_path%%/*}"
  filename=$(basename "$src_file" .md)
  # category/filename 格式作为输出目录
  out_dir="$OUT/$category/$filename"

  TOTAL=$((TOTAL + 1))

  echo -n "[$TOTAL] 转换 $category/$filename ... "

  # 转换（跳过验证，加速）
  if node "$AGENT_FORGE" convert agent \
    -i "$src_file" \
    -o "$out_dir" \
    --skip-validation \
    > /tmp/forge-stderr.log 2>&1; then

    AGENT_PASS=$((AGENT_PASS + 1))

    # 统计生成的 SKILL.md 文件数量
    skill_count=$(find "$out_dir/skills" -name "SKILL.md" 2>/dev/null | wc -l)
    echo "✅ ($skill_count skills)"

    # 批量验证 skills（用 skill-forge）
    if [ "$skill_count" -gt 0 ]; then
      for skill_file in "$out_dir/skills"/*/SKILL.md; do
        [ -f "$skill_file" ] || continue
        SKILL_TOTAL=$((SKILL_TOTAL + 1))

        # 用 Python 调用 skill-forge 验证
        result=$(python3 -c "
from skill_forge.cli import main
import sys, io, contextlib
f = io.StringIO()
with contextlib.redirect_stdout(f):
    code = main(['validate', '$skill_file'])
print('PASS' if code == 0 else 'FAIL')
" 2>/dev/null)

        if [ "$result" = "PASS" ]; then
          SKILL_PASS=$((SKILL_PASS + 1))
        elif [ "$result" = "FAIL" ]; then
          SKILL_FAIL=$((SKILL_FAIL + 1))
          # 打印失败的文件
          echo "   ❌ skill 验证失败: ${skill_file##*/}"
        else
          SKILL_ERROR=$((SKILL_ERROR + 1))
        fi
      done
    fi
  else
    AGENT_FAIL=$((AGENT_FAIL + 1))
    echo "❌"
    cat /tmp/forge-stderr.log | head -3
  fi
done

echo ""
echo "=========================================="
echo "批量测试结果"
echo "=========================================="
echo "Agent 转换: $AGENT_PASS/$TOTAL 通过, $AGENT_FAIL 失败"
echo "Skill 验证: $SKILL_PASS/$SKILL_TOTAL 通过, $SKILL_FAIL 失败, $SKILL_ERROR 错误"
if [ "$SKILL_TOTAL" -gt 0 ]; then
  skill_rate=$(python3 -c "print(f'{$SKILL_PASS/$SKILL_TOTAL*100:.1f}')")
  echo "Skill 通过率: $skill_rate%"
fi
echo ""
echo "结果保存在: $OUT"

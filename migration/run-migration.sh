#!/bin/bash
# ============================================================
# Supabase Cloud → AnalyticDB Supabase 迁移执行脚本
# ============================================================
# 前置条件:
#   1. 已在阿里云控制台创建 AnalyticDB Supabase 实例 (免费版 1C2G)
#   2. 已安装并启动 Docker
#   3. 已填写 migration.env 中的所有配置
#
# 用法:
#   source migration.env
#   bash run-migration.sh [--dry-run]
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/../tools/supabase-cli-windows-amd64.exe"

# 检查 CLI 是否存在
if [ ! -f "$CLI" ]; then
  echo "ERROR: supabase-cli not found at $CLI"
  exit 1
fi

# 检查必要的环境变量
check_var() {
  if [ -z "${!1:-}" ] || [[ "${!1}" == *"<"* ]]; then
    echo "ERROR: $1 is not set or still contains placeholder"
    exit 1
  fi
}

echo "=== 检查环境变量 ==="
check_var SOURCE_PROJECT_REF
check_var SOURCE_ANON_KEY
check_var SOURCE_SERVICE_ROLE_KEY
check_var TARGET_API_URL
check_var TARGET_ANON_KEY
check_var TARGET_SERVICE_ROLE_KEY
check_var TARGET_DATABASE_URL
echo "OK: All environment variables set"

# 构建命令
CMD=("$CLI" migrate-project \
  --source-project-ref "$SOURCE_PROJECT_REF" \
  --source-anon-key "$SOURCE_ANON_KEY" \
  --source-service-role-key "$SOURCE_SERVICE_ROLE_KEY" \
  --target-api-url "$TARGET_API_URL" \
  --target-anon-key "$TARGET_ANON_KEY" \
  --target-service-role-key "$TARGET_SERVICE_ROLE_KEY" \
  --target-database-url "$TARGET_DATABASE_URL")

# 如果指定了 source database url
if [ -n "${SOURCE_DATABASE_URL:-}" ] && [[ "$SOURCE_DATABASE_URL" != *"<"* ]]; then
  CMD+=(--source-database-url "$SOURCE_DATABASE_URL")
fi

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  CMD+=(--dry-run)
  DRY_RUN=true
  echo "=== 预览模式 (--dry-run) ==="
else
  echo "=== 正式迁移 ==="
fi

echo ""
echo "命令: ${CMD[*]}"
echo ""

if [ "$DRY_RUN" = false ]; then
  echo "WARNING: 即将执行正式迁移!"
  echo "按 Enter 继续, Ctrl+C 取消..."
  read -r
fi

"${CMD[@]}"

echo ""
echo "=== 迁移完成 ==="
if [ "$DRY_RUN" = false ]; then
  echo ""
  echo "后续步骤:"
  echo "  1. 更新 .env 文件:"
  echo "     VITE_SUPABASE_URL=$TARGET_API_URL"
  echo "     VITE_SUPABASE_PUBLISHABLE_KEY=$TARGET_ANON_KEY"
  echo "  2. 运行 npm run dev 测试"
  echo "  3. 验证所有功能: 登录、刷题、AI导入、文件上传 等"
fi

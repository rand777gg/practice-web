#!/bin/bash
# 闲时自动更新容器镜像(同 minor 内的 patch 级),带自检与自动回滚。
#
# 策略:
#   - postgres:16 / redis:7.2 / nginx:1.27-alpine 用浮动 minor 标签,拉到同系列最新 patch;
#   - judge0/judge0:1.13.1 精确锁定(上游已停更,跨版本升级有 DB/配置风险,只做通知不自动升);
#   - 更新后必须通过自检(401/200/真跑一次提交),否则 30 秒内自动回滚到更新前的镜像。
#
# 用法: bash autoupdate.sh          (由 systemd timer 在闲时调用)
set -uo pipefail
cd /opt/judge0

LOG=/var/log/judge0-autoupdate.log
ROLLBACK_OVERRIDE=docker-compose.rollback.yml
BACKUP_COMPOSE=docker-compose.yml.autoupdate-bak
STATE=/var/lib/judge0-autoupdate.state

exec 9>/run/judge0-autoupdate.lock || exit 1
flock -n 9 || { echo "$(date '+%F %T') 已有实例在运行,跳过" >> "$LOG"; exit 0; }

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
say() { echo "$*"; log "$*"; }

[ -f "$LOG" ] || : > "$LOG"
. ./.secrets 2>/dev/null || { log "读不到 .secrets,退出"; exit 1; }
U=http://127.0.0.1:2358

selftest() {
  [ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$U/config_info" 2>/dev/null)" = "401" ] || { say "  自检失败: 匿名应为 401"; return 1; }
  [ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: $AUTHN_TOKEN" "$U/config_info" 2>/dev/null)" = "200" ] || { say "  自检失败: 带令牌应为 200"; return 1; }
  local tok st i
  tok=$(curl -sS --max-time 25 -X POST "$U/submissions?base64_encoded=false" \
        -H "Authorization: $AUTHN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"source_code":"print(6*7)","language_id":71,"stdin":""}' 2>/dev/null \
        | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  [ -n "$tok" ] || { say "  自检失败: 提交创建不出来"; return 1; }
  for i in $(seq 1 25); do
    sleep 2
    st=$(curl -sS --max-time 10 -H "Authorization: $AUTHN_TOKEN" "$U/submissions/$tok?fields=status" 2>/dev/null \
         | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
    [ -n "${st:-}" ] && [ "$st" -ge 3 ] 2>/dev/null && break
  done
  [ "${st:-0}" = "3" ] || { say "  自检失败: 执行未 Accepted(status=${st:-无})"; return 1; }
  say "  自检通过: 401 / 200 / 真实提交 Accepted"
  return 0
}

do_rollback() {
  say "!! 自检未通过,回滚到更新前的镜像"
  [ -f "$ROLLBACK_OVERRIDE" ] || { say "   没有回滚文件,无法自动回滚,请人工处理"; return 1; }
  docker compose -f docker-compose.yml -f "$ROLLBACK_OVERRIDE" up -d --force-recreate >>"$LOG" 2>&1
  sleep 30
  if selftest; then say "   回滚成功,服务已恢复"; else say "   回滚后自检仍失败,需要人工介入!"; fi
}

say "===== 开始检查更新 ====="
command -v flock >/dev/null || say "(注意: 没有 flock,已跳过并发保护)"

# 1. 记录更新前镜像,并打本地回滚标签
: > "$ROLLBACK_OVERRIDE"
printf 'services:\n' >> "$ROLLBACK_OVERRIDE"
for s in server workers db redis proxy; do
  cid=$(docker compose ps -q "$s" 2>/dev/null)
  [ -z "$cid" ] && continue
  img=$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null)
  [ -z "$img" ] && continue
  docker tag "$img" "judge0-rollback-$s:latest" 2>/dev/null || true
  printf '  %s:\n    image: judge0-rollback-%s:latest\n' "$s" "$s" >> "$ROLLBACK_OVERRIDE"
  say "  记录 $s: $img"
done

before=$(docker compose config --images 2>/dev/null | sort | while read -r i; do
  docker image inspect -f '{{.Id}}' "$i" 2>/dev/null | head -c 20; echo " $i"
done)
cp -f docker-compose.yml "$BACKUP_COMPOSE"

# 2. 拉取
say "--- docker compose pull ---"
if ! docker compose pull >>"$LOG" 2>&1; then
  say "pull 失败(网络或镜像源问题),保持现状不动"
  rm -f "$ROLLBACK_OVERRIDE"
  exit 0
fi

after=$(docker compose config --images 2>/dev/null | sort | while read -r i; do
  docker image inspect -f '{{.Id}}' "$i" 2>/dev/null | head -c 20; echo " $i"
done)

if [ "$before" = "$after" ]; then
  say "镜像无变化,无需重建"
  rm -f "$ROLLBACK_OVERRIDE"
  echo "$(date '+%F') no-change" > "$STATE"
  exit 0
fi

say "--- 检测到镜像变化,重建容器 ---"
echo "$before" > "$STATE.before"
echo "$after"  > "$STATE.after"
if ! docker compose up -d --force-recreate >>"$LOG" 2>&1; then
  say "重建失败"
  do_rollback
  exit 1
fi

say "--- 等待服务就绪 ---"
sleep 35
if selftest; then
  say "更新成功,变化如下:"
  diff <(echo "$before") <(echo "$after") | sed 's/^/    /' | while read -r l; do say "$l"; done
  rm -f "$ROLLBACK_OVERRIDE"
  echo "$(date '+%F') updated" > "$STATE"
else
  do_rollback
  exit 1
fi
say "===== 结束 ====="

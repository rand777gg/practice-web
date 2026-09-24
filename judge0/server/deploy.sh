#!/bin/bash
# 部署/更新平台中心 Judge0 节点(自带鉴权)。幂等:重复执行保留已有密钥。
#
# 前置:本目录下须有 judge0.conf(上游默认值，从仓库 judge0/judge0.conf 拷来)、
#       docker-compose.yml、nginx.conf。
#
#   cd /opt/judge0 && bash deploy.sh
set -euo pipefail

D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$D"
[ -f judge0.conf ] || { echo "缺少 judge0.conf(从仓库 judge0/judge0.conf 拷来)"; exit 1; }

rand() { openssl rand -hex "${1:-32}"; }

# ---- 1. 密钥:只在首次生成,不落仓库 ----
if [ ! -f .secrets ]; then
  umask 077
  cat > .secrets <<EOF
AUTHN_TOKEN=$(rand 32)
AUTHZ_TOKEN=$(rand 32)
REDIS_PASSWORD=$(rand 24)
POSTGRES_PASSWORD=$(rand 24)
EOF
fi
chmod 600 .secrets
set -a; . ./.secrets; set +a

# ---- 2. judge0.conf:上游默认值 + 覆盖项 ----
conf_set() {
  local k="$1" v="$2"
  if grep -qE "^${k}=" judge0.conf; then
    sed -i "s|^${k}=.*|${k}=${v}|" judge0.conf
  else
    printf '%s=%s\n' "$k" "$v" >> judge0.conf
  fi
}
conf_set JUDGE0_TELEMETRY_ENABLE false
conf_set REDIS_PASSWORD        "$REDIS_PASSWORD"
conf_set POSTGRES_PASSWORD     "$POSTGRES_PASSWORD"
# 鉴权:所有端点都要 Authorization(值为令牌本身,不带 Bearer 前缀)
conf_set AUTHN_HEADER          Authorization
conf_set AUTHN_TOKEN           "$AUTHN_TOKEN"
# 授权:保护 submissions#index(列全部) / submissions#destroy / sessions#authorize
conf_set AUTHZ_HEADER          X-Auth-User
conf_set AUTHZ_TOKEN           "$AUTHZ_TOKEN"
# 加固:提交内不允许开网络;删除接口保持关闭
conf_set ALLOW_ENABLE_NETWORK  false
conf_set ENABLE_SUBMISSION_DELETE false
# 平台一次提交会把整题测试点放进一个 batch,上游默认上限 20 太小
conf_set MAX_SUBMISSION_BATCH_SIZE 64

sed -i 's/\r$//' judge0.conf

# ---- 3. 关键:容器以 uid=1000(judge0) 运行,读不到就是"所有配置键为空"→ 全线 502 ----
chown 1000:999 judge0.conf
chmod 640 judge0.conf

echo "=== effective auth settings ==="
grep -E '^(AUTHN_HEADER|AUTHZ_HEADER|MAX_SUBMISSION_BATCH_SIZE|ALLOW_ENABLE_NETWORK|ENABLE_SUBMISSION_DELETE|JUDGE0_TELEMETRY_ENABLE)=' judge0.conf
grep -E '^AUTHN_TOKEN=' judge0.conf | sed 's/=.*/=<set>/'
grep -E '^AUTHZ_TOKEN=' judge0.conf | sed 's/=.*/=<set>/'

# ---- 4. 起服务(--force-recreate 保证 server/workers 重新读挂载进去的配置) ----
docker compose pull
docker compose up -d --force-recreate
sleep 30
docker compose ps

echo
echo "=== 自检 ==="
code_anon=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:2358/config_info || true)
code_auth=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: $AUTHN_TOKEN" http://127.0.0.1:2358/config_info || true)
echo "无令牌 -> $code_anon (期望 401)"
echo "带令牌 -> $code_auth (期望 200)"
if [ "$code_anon" = "401" ] && [ "$code_auth" = "200" ]; then
  echo "OK: 节点鉴权生效"
else
  echo "警告: 预期不符,检查 docker compose logs server workers"
fi

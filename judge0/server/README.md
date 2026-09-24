# 中心判题节点部署(云服务器)

这是**公网中心判题节点**（`judge0/judge0:1.13.1`）的部署目录，和旁边的 `../docker-compose.yml` 不是一回事：

| | `judge0/`（上一层） | `judge0/server/`（本目录） |
|---|---|---|
| 用途 | 用户**本机自测**（VirtualBox Ubuntu 22.04） | **平台中心判题**节点 |
| 鉴权 | 关闭 | `AUTHN` + `AUTHZ` 全开 |
| 暴露 | `0.0.0.0:2358`，供浏览器直连 | 只给服务端调；浏览器永不直连 |
| CORS / PNA 头 | 补（浏览器要跨域） | 刻意不加 |
| 平台侧 | 前端 `JUDGE0_DEFAULT_URL` | Supabase `judge` / `judge-health` 函数 |

设计与实施细节见 `../../docs/judge0-auth-design.md`。

## 前置条件

1. **cgroup v1**（硬要求）。Ubuntu 22.04 默认 cgroup v2，Judge0 的 `isolate` 会恒报 `status 13`。在 `/etc/default/grub` 的 `GRUB_CMDLINE_LINUX` 加上
   `systemd.unified_cgroup_hierarchy=0 cgroup_enable=memory swapaccount=1`，然后 `update-grub && reboot`。
   校验：`docker info | grep 'Cgroup Version'` 应为 `1`。
2. Docker + Compose v2：`apt install -y docker.io docker-compose-v2`。
3. 镜像源。国内/香港机器直连 Docker Hub 可能只有几十 KB/s（`judge0/judge0:1.13.1` 压缩后 3.07GB），建议配 `/etc/docker/daemon.json`：

   ```json
   { "registry-mirrors": ["https://docker.m.daocloud.io"] }
   ```

## 部署

把这四个文件放进服务器上的同一个目录（例如 `/opt/judge0`）：

```
judge0.conf          # 从仓库 judge0/judge0.conf 拷来(上游默认值，脚本会覆盖关键项)
docker-compose.yml
nginx.conf
deploy.sh
```

然后：

```bash
cd /opt/judge0 && bash deploy.sh
```

脚本是幂等的：密钥只在首次生成（写在 `.secrets`，`0600`），重复执行只会重新套用配置并重建容器。

## ⚠️ 最容易踩的坑：配置文件的属主

Judge0 容器**以 `uid=1000(judge0) gid=999(judge0)` 运行，不是 root**。`judge0.conf` 是挂载进去的，如果宿主上是 `root:root 0640`，容器**读不到**，后果是**每个配置键都变成空值**（`POSTGRES_HOST=`、`REDIS_HOST=` 全空）→ Rails 启动即 `PG::ConnectionBad: Connection refused` → nginx 全线 `502`，而日志只会告诉你连不上数据库，不会提示权限问题。

所以必须是：

```bash
chown 1000:999 judge0.conf && chmod 640 judge0.conf
```

`deploy.sh` 已经带这一步。另外注意 `docker compose exec <svc> env` **看不到**入口脚本 `source /judge0.conf` 导出的变量（`exec` 取的是容器配置里的 env，不是 PID 1 的 environ），别用它来判断配置有没有生效——直接 `curl` 接口更可靠。

## 验收

```bash
. /opt/judge0/.secrets
U=http://127.0.0.1:2358
curl -s -o /dev/null -w '%{http_code}\n' $U/config_info                          # 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: $AUTHN_TOKEN" $U/config_info   # 200
```

完整的 8 项验收（含真实提交）见 `docs/judge0-auth-design.md` §7。

## 自动更新（闲时）

`autoupdate.sh` 由 `judge0-autoupdate.timer` 每天 05:00（Asia/Shanghai）调用，做四件事：

1. 记录当前各服务的镜像 ID，并打上本地回滚标签 `judge0-rollback-<服务>:latest`
2. `docker compose pull`（拉同 minor 的最新 patch）→ 有变化才 `up -d --force-recreate`
3. **自检**：匿名 `401` + 带令牌 `200` + 真跑一次 `print(6*7)` 必须 `Accepted`
4. 自检不过 → 用 `docker-compose.rollback.yml` 覆盖回旧镜像并重建，日志留在 `/var/log/judge0-autoupdate.log`

版本策略：

| 镜像 | 标签 | 说明 |
|---|---|---|
| `postgres` | `16` | 浮动 minor，自动拿 16.x 的 patch 安全更新 |
| `redis` | `7.2` | 同上 |
| `nginx` | `1.27-alpine` | 同上 |
| `judge0/judge0` | `1.13.1` | **精确锁定**。上游 2024-04 后已停更，跨版本升级有 DB schema / 配置键风险，不做自动升级 |

系统层另有 `unattended-upgrades`（只装 security 源，**不自动重启**）。三个定时任务错开：

| 时间 (CST) | 任务 |
|---|---|
| 03:30 | `apt-daily` 刷新索引 |
| 04:00 | `apt-daily-upgrade` 安全补丁 |
| 05:00 | `judge0-autoupdate` 容器镜像 |

> 内核类补丁要重启才生效。这里故意**不开自动重启**，避免打断考试；需要时手动 `reboot`（已验证重启后容器、隧道、isolate 全自动恢复）。

手动跑一次：`bash /opt/judge0/autoupdate.sh`；看历史：`tail -50 /var/log/judge0-autoupdate.log`。

## 压力测试

`stress-test.py`（在服务器上跑，直连 `localhost:2358` 绕开 Cloudflare 与 Edge Function 限制）：

```bash
python3 /opt/judge0/stress-test.py     # 结果另存 /root/stress-result.json
```

2 vCPU / 4GB 这台机器的实测（一次提交 = 3 个测试点，含 1 个 C++）：

| 并发 | 吞吐(次/分) | p50 | p95 | 错误 |
|---|---|---|---|---|
| 1 | 35 | 1.6s | 1.6s | 0 |
| 4 | 42 | 4.6s | 7.0s | 0 |
| 8 | 38 | 11.4s | 13.5s | 0 |
| 16 | 31 | 27.1s | 34.2s | 0 |
| 32 | 26 | 50.4s | 72.7s | 0 |

- 瓶颈是 **CPU**（2 核），吞吐 ~40 次/分封顶，全程零错误（没有 429/拒绝）
- `judge` Edge Function 给单次提交的截止是 `max(20s, cpuMs×测试点数 + 10s)`，所以**同时提交超过 ~8 份**就会开始报判题超时
- 换算：按学生平均 1~2 分钟提交一次，**同时在线 30~50 人**体验正常；考试那种集中爆发建议 ≤10 人同时提交
- 扩容优先加 vCPU（CPU-bound，接近线性），或按仓库里那条 TODO 做多节点 + 就近/负载选点

## SSH 免密登录

公钥认证已开启（`/etc/ssh/sshd_config` 原来被设成 `PubkeyAuthentication no`，是它导致密钥登不进去），密码登录已关闭：

```bash
ssh -p 22000 root@103.117.123.151      # 用本机 ~/.ssh/id_rsa,不再需要密码
```

- `PermitRootLogin prohibit-password`、`PasswordAuthentication no`、`KbdInteractiveAuthentication no`
- 原配置备份在 `/etc/ssh/sshd_config.bak-j0`
- **改完必须用真正的客户端验证**，别只用工具库验证——`ssh -o BatchMode=yes` 会禁掉一切密码交互，能过才是真·纯密钥：
  ```bash
  ssh -p 22000 -o BatchMode=yes root@103.117.123.151 "hostname"   # 应回显主机名且退出码 0
  ```
- 私钥指纹：`SHA256:9IsfN+4Wz6zMH14GBwMmOizSYc/YEq16EdVwGE4OAlg`（`id_rsa`，无 passphrase）
- **万一密钥丢失**：从云厂商控制台/VNC 进去把 `PasswordAuthentication` 改回 `yes`（或重装控制台密钥）
- 密码登录一关，公网爆破就失去意义了，不需要再上 fail2ban

## 运维

```bash
cd /opt/judge0
docker compose ps
docker compose logs --tail 100 server workers
docker compose restart server workers      # 改完 judge0.conf 后
```

换令牌：改 `.secrets` → 重跑 `deploy.sh` → 同步更新 Supabase：

```bash
npx supabase secrets set JUDGE0_TOKEN=<新的 AUTHN_TOKEN>
npx supabase functions deploy judge judge-health
```

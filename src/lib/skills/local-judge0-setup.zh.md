---
name: local-judge0-setup
description: 在用户本机（VirtualBox 的 Ubuntu 22.04 虚拟机）安装并启动 Judge0 CE 判题服务，供刷题平台「本地自测」逐测试点判题；装好后可用 REST 接口批量提交代码、轮询结果、比对输出。当用户提到「本地判题 / Judge0 / 装判题机 / status 13 / 本地自测连不上」时使用。
---

# 本地 Judge0 判题环境（安装 + 操作）

编程题要在用户自己的机器上跑，结果只用于个人练习。你要做两件事：**把 Judge0 装起来**，以及**用它的 REST 接口逐测试点判代码**。

## 0. 关键前提：必须是 cgroup v1 的 Linux

Judge0 的 `isolate` 沙箱依赖 **cgroup v1**。

- ✅ VirtualBox / VMware 里装的 **Ubuntu 22.04** 虚拟机（本项目实测路径）
- ❌ Windows 的 Docker Desktop、WSL2：只有 cgroup v2，提交会**恒报 `status.id = 13`**
- ❌ macOS 同理，不要在上面折腾

用户说要在 Windows / macOS 直接跑，就直接告诉他这一条，别浪费他的时间试。

## 1. 装 VirtualBox + Ubuntu 22.04

1. 装 Oracle VirtualBox，下载 Ubuntu 22.04 Server 镜像（判题不需要图形界面）。
2. 新建虚拟机：内存 **≥ 4GB**、硬盘 **≥ 40GB**、CPU **≥ 2 核**。
3. 按向导装完系统，记下登录账号密码。

## 2. 端口转发：让宿主机的 localhost:2358 直达虚拟机

**虚拟机关机状态下**：设置 → 网络 → 连接方式 `NAT` → 高级 → 端口转发，加一条规则：

```
协议 TCP    主机端口 2358    客户机端口 2358    主机 IP 留空
```

之后宿主机访问 `http://localhost:2358` 就会转发进虚拟机里的 Judge0。

## 3. 开机并强制 cgroup v1（漏了必报 status 13）

在 Ubuntu 终端执行（需要 sudo）：

```bash
sudo nano /etc/default/grub
# 把 GRUB_CMDLINE_LINUX 改成下面这行（原来是空也可以）：
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
ls /sys/fs/cgroup/memory   # 有内容 = cgroup v1 已生效，继续下一步
```

**验证点**：`ls /sys/fs/cgroup/memory` 有输出才算过。空的或不存在就别往下走，先解决 cgroup。

## 4. 在 Ubuntu 里装 Docker 并启动 Judge0

把仓库里的 `judge0/` 目录拷进虚拟机（或 `git clone` 用户的仓库），然后：

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
cd judge0
docker compose up -d
curl http://localhost:2358/config_info   # 虚拟机内看到 JSON 即成功
```

`judge0/docker-compose.yml` 已包含 5 个服务：`server`、`workers`、`db`(postgres:16.2)、`redis`、`proxy`(nginx:1.27-alpine 对外 2358)。`nginx.conf` 已补好 CORS 与 `Access-Control-Allow-Private-Network` 响应头，浏览器可从 HTTPS 页面直连本机，**不需要额外改浏览器设置**。

常用运维命令：

```bash
docker compose ps                 # 看 5 个容器是否都起来
docker compose logs -f workers    # 卡住时看 worker 日志
docker compose restart            # 改完 judge0.conf 后重启
docker compose down               # 停止（不加 -v，保留数据）
```

## 5. 从宿主机验证

```bash
# Windows / macOS / Linux 宿主机
curl -s http://localhost:2358/config_info
```

看到 JSON 就通了；再让用户回平台「本地判题」页点「重新检测」变绿，进任意编程题在编辑器顶部打开「本地自测」。

## 6. 用 REST 接口判代码（逐测试点）

Judge0 的每次提交 = 一次完整的「编译 + 运行」，天然对应 OJ 的一个测试点。**每个测试点单独提交一条**，再批量轮询比对。

```bash
# ① 查语言 id（常用值见下表，可用 GET /languages 现场确认）
curl -s http://localhost:2358/languages

# ② 批量提交：一个测试点一条
curl -s -X POST "http://localhost:2358/submissions/batch?base64_encoded=false" \
  -H "Content-Type: application/json" \
  -d '{"submissions":[
        {"source_code":"print(int(input())+1)","language_id":71,"stdin":"1","cpu_time_limit":2,"memory_limit":131072},
        {"source_code":"print(int(input())+1)","language_id":71,"stdin":"41","cpu_time_limit":2,"memory_limit":131072}
      ]}'
# 返回每条各自的 token

# ③ 轮询结果（每轮留 400ms 间隔，别打满服务）
curl -s "http://localhost:2358/submissions/batch?tokens=<t1>,<t2>&fields=token,stdout,stderr,compile_output,status,time,memory"
```

参数单位别搞错：`cpu_time_limit` 是**秒**，`memory_limit` 是 **KB**。本项目把自定义值钳制在 `cpu_time_limit ≤ 15s`、`memory_limit ≤ 512000KB`，并且**不传** `wall_time_limit` / `stack_size_limit`，否则服务端会回 422。

### 语言 id（Judge0 CE 1.13 内置表）

| 语言 | key | language_id |
| --- | --- | --- |
| C (GCC 7.4.0) | `c` | 50 |
| C++ (GCC 7.4.0) | `cpp` | 54 |
| Java (OpenJDK 13.0.1) | `java` | 62 |
| JavaScript (Node.js 12.14.0) | `javascript` | 63 |
| TypeScript (3.7.4) | `typescript` | 74 |
| Python (3.8.1) | `python` | 71 |

### 状态 id（`GET /statuses`）

| id | 含义 | 判定 |
| --- | --- | --- |
| 1 / 2 | In Queue / Processing | 未完成，继续轮询 |
| 3 | Accepted | 代码跑通，**还要再比 stdout** |
| 4 | Wrong Answer | 输出不一致 |
| 5 | Time Limit Exceeded | 超时 |
| 6 | Compilation Error | 看 `compile_output` |
| 7–12 | Runtime Error（各信号） | 看 `stderr` |
| 13 | Internal Error | 十有八九是 cgroup v2，回第 3 步 |

**判通过的完整条件**：`status.id == 3` **且** `stdout` 与期望输出一致。比对时忽略行尾空白与尾部空行（本项目用 `replace(/\s+$/, '')` 后再比）。题库里存的可能是字面 `\n` 而不是真换行，提交前要还原成真实字符，否则 stdin 会带着字面反斜杠导致报错。

## 7. 边界（必须遵守）

- 判题结果**不可信**，只作练习参考：不参与排行榜，不计入公开成绩、考试、竞赛。
- **全部测试点通过才写「已通过 / Accepted」**；连不上判题服务就如实写「未本地验证」，**严禁谎报通过**。
- 本地自测与平台中心判题是两条路：涉及正式成绩的结论以平台中心判题为准。
- 不要为了让结果好看去改测试点、改期望输出或伪造 stdout。

## 8. 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提交恒报 `status.id = 13` | cgroup v2（Windows Docker Desktop / WSL2，或没改 grub） | 回第 3 步强制 cgroup v1，或改用 VirtualBox Ubuntu |
| 宿主机 `curl localhost:2358` 无响应 | 端口转发没配 / 虚拟机关机 / 服务没起 | 查 NAT 端口转发规则、虚拟机状态、`docker compose ps` |
| 浏览器报 CORS 或 `Private Network Access` 被拦 | 没走仓库自带的 proxy | 用仓库 `judge0/docker-compose.yml`（nginx 已补响应头） |
| 提交回 422 | 参数超上限 | `cpu_time_limit ≤ 15`（秒）、`memory_limit ≤ 512000`（KB），别传 wall/stack 限制 |
| 一直返回 id 1 / 2 | workers 没起来 | `docker compose ps` 看 workers，必要时 `docker compose logs workers` |
| 部分语言报语言不存在 | `language_id` 写错 | `GET /languages` 现场确认 |
| 平台「重新检测」仍红 | 探测打的是 `http://localhost:2358/config_info` | 宿主机上先自己 curl 通，再回平台重试 |

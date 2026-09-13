---
name: local-supabase-docker
description: 在用户本机用 Docker 拉起一套 Supabase 开源版（Postgres + Auth + Storage + REST），建好题库表并验证连通，再把连接信息交给刷题平台的「我的题库」。当用户提到「本地题库 / 本地 Supabase / Docker 起数据库 / 我的题库连不上 / 初始化题目表」时使用。
---

# 本地 Supabase 题库（Docker 自部署）

用户的题目**只存在他自己的机器上**，平台不留副本。你的职责是：把环境起好 → 建表 → 验证通过 → 把连接字段交给用户去填。

## 0. 动手前先确认前提

```bash
docker --version
docker info >/dev/null 2>&1 && echo "docker 运行中" || echo "docker 未运行，请先启动 Docker Desktop"
```

- 端口占用先看，**不要强杀别人的进程**：
  - Windows：`netstat -ano | findstr ":54321 :54322"`
  - macOS / Linux：`lsof -nP -iTCP:54321 -iTCP:54322 -sTCP:LISTEN`
- 走方式一需要 Node.js 18+（用 `npx supabase`）。
- **任何一步失败就停下，把原始报错贴给用户**，不猜、不假装成功。

## 1. 方式一：Supabase CLI（推荐，含 Auth / Storage / Studio）

```bash
npx supabase init      # 仅首次执行，生成 supabase/ 目录
npx supabase start     # 启动整套服务；首次拉镜像几分钟属正常
```

结束时它会打印下面几行，**原样读出来记下**：

```
API URL      : http://127.0.0.1:54321
anon key     : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # 只给自己用，绝不写进前端
DB URL       : postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

常用命令：

```bash
npx supabase status     # 随时回看地址与密钥
npx supabase stop       # 停止服务，数据保留在 Docker volume 里
npx supabase db reset   # 重建本地库，会清空数据 —— 必须用户明确同意后再执行
```

默认端口：`54321` API 网关 / `54322` Postgres / `54323` Studio / `54324` 邮件面板。

## 2. 方式二：只要一个 Postgres 容器

适合已有后端、只想借一个标准 Postgres 的用户。这条路径**没有** REST / Auth / Storage，平台侧需要用户自建接口或直连数据库。

```bash
docker run -d --name my-bank-db \
  -e POSTGRES_PASSWORD='<让用户自己定的强密码>' \
  -e POSTGRES_DB=my_question_bank \
  -p 54322:5432 \
  -v my-bank-data:/var/lib/postgresql/data \
  supabase/postgres:15.1.0.147

docker exec -it my-bank-db psql -U postgres -d my_question_bank -c "select 1"
```

## 3. 建题库表（两种方式都要做）

最小可用表结构：

```sql
create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  topic_code  text not null,           -- 例如 408-01
  type        text not null,           -- 单项选择 / 综合应用 / 算法设计 …
  stem        text not null,
  options     jsonb,                   -- [{ "key": "A", "text": "…" }]
  answer      text,
  analysis    text,
  tags        text[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists questions_topic_idx on questions (topic_code);
```

执行（把上面的 SQL 存成 `schema.sql` 更好读）：

```bash
# 方式一：CLI 起的本地库（容器名是 supabase_db_<项目目录名>，先用 docker ps 确认）
docker ps --format "{{.Names}}" | findstr supabase_db      # Windows
docker ps --format "{{.Names}}" | grep supabase_db         # macOS / Linux
docker exec -i supabase_db_<项目目录名> psql -U postgres -d postgres -f - < schema.sql

# 方式二：直连自己起的容器
docker exec -i my-bank-db psql -U postgres -d my_question_bank -f - < schema.sql
```

## 4. 必须验证，并把原始输出贴出来

```bash
# 走 CLI 的库：REST 能读到空表即成功
curl -s "http://127.0.0.1:54321/rest/v1/questions?select=id&limit=1" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
# 期望：[]            （空数组 = 表和策略都能读）
# 42P01 = 表没建成功；401 = key 不对
```

```bash
# 两种方式都可用的表结构核对
docker exec -i my-bank-db psql -U postgres -d my_question_bank -c "\d questions"
```

## 5. 交给用户填到平台

让用户打开侧边栏「题库 → 我的题库」，选「本地 Docker 启动 Supabase 开源版」，填三个字段：

| 字段 | 填什么 |
| --- | --- |
| API URL | `http://127.0.0.1:54321`（方式二填用户自建接口地址） |
| anon key | `start` 打印的 anon key |
| 数据库连接串（可选） | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

凭据只存在用户自己的浏览器里：不要提交进仓库、不要写进代码、不要发给任何第三方。

## 6. 边界（必须遵守）

- 平台的「我的题库」**不接收、不存储**用户库里的题目。只有用户自己勾选「共享」并点「上传到平台」，才会走 `POST /functions/v1/my-bank-upload`。
- 破坏性操作（`supabase stop --no-backup`、`docker rm -v`、`drop table`、`db reset`）必须先拿到用户明确同意。
- 不要把 `service_role` key 放进前端代码或分享出去。
- 做不到就如实写「未本地验证」，**不要编造成功输出**。
- 这些题目不参与平台排行榜与成绩统计，平台也不保证用户自建库的可用性。

## 7. 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker 没启动 | 启动 Docker Desktop / `sudo systemctl start docker` |
| `supabase start` 长时间停在 pulling | 首次拉镜像慢 | 等着；或先手动 `docker pull` 对应镜像 |
| `port is already allocated` | 54321 / 54322 被占 | 释放占用进程，或改 `supabase/config.toml` 里的端口 |
| REST 报 `42P01 relation "questions" does not exist` | 表没建，或建到了别的库 | 重跑第 3 步，确认连的是同一个库 |
| REST 一直返回 `[]` | 正常，用户还没往里写题目 | 让用户在「我的题库」里新增题目 |
| 平台「测试连接」通过但读不到题 | 该页当前是 DEMO | 如实告知：只校验表单是否填全，不真正连库 |

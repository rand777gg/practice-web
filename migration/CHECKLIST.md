# AnalyticDB Supabase 迁移检查清单

## 第一步：阿里云创建目标实例

在阿里云控制台创建 AnalyticDB Supabase 免费实例：

1. 登录 [阿里云控制台](https://home.console.aliyun.com/)
2. 进入 **云原生数据仓库 AnalyticDB PostgreSQL 版** → **Supabase**
3. 点击 **创建项目**，选择 **免费试用** (1C2G / 1GB)
4. 填写：
   - 项目名称: `react-practice-web` (或任意)
   - 数据库密码: 设置一个强密码 (需含大写、小写、数字、特殊字符中的三种)
   - 地域: 选择离你最近的地域 (杭州/上海/北京等)
   - VPC + 交换机: 如无现有网络，先去 VPC 控制台创建
   - IP 白名单: 填 `0.0.0.0/0` (允许公网访问)
5. 等待创建完成后，从控制台获取：
   - [ ] **API URL** (格式: `https://<id>.supabase.opentrust.net`)
   - [ ] **Anon Key** (匿名密钥)
   - [ ] **Service Role Key** (服务角色密钥)
   - [ ] **Database URL** (连接串，格式: `postgres://postgres:<password>@<id>.supabase.opentrust.net:5432/postgres`)

## 第二步：获取源端 Supabase Cloud 密钥

从 [Supabase Dashboard](https://supabase.com/dashboard/project/bszkmteimqfnvovroikt) → Settings → API：

- [ ] **Service Role Key** (在 Project API Keys 中，以 `eyJ` 开头)
- [ ] **数据库密码** (Settings → Database → Database Password)

> 注意：Anon Key 已经在 .env 中，Service Role Key 需要单独获取。

## 第三步：填写迁移配置

复制并填写 `migration/migration.env`：

```bash
cp migration/migration.env.template migration/migration.env
# 编辑 migration.env，填入所有信息
```

## 第四步：预览迁移 (--dry-run)

```bash
source migration/migration.env
bash migration/run-migration.sh --dry-run
```

确认预览结果无误。

## 第五步：执行迁移

```bash
source migration/migration.env
bash migration/run-migration.sh
```

## 第六步：更新前端配置

编辑 `.env`，替换：

```
VITE_SUPABASE_URL=<TARGET_API_URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<TARGET_ANON_KEY>
```

## 第七步：验证

- [ ] `npm run dev` 启动开发服务器
- [ ] 登录/注册
- [ ] 练习模式
- [ ] 考试模式
- [ ] 错题回顾
- [ ] AI 导入 (MinerU)
- [ ] 文件上传 (R2)
- [ ] 设置页面
- [ ] 管理员功能

# 数据库备份（Supabase → Cloudflare R2）

GitHub Actions 每天 02:20 UTC 自动把托管 Supabase 的 Postgres 全库逻辑备份上传到 Cloudflare R2 私有 bucket，保留 30 天，失败时可选飞书告警。可随时手动触发（`Actions → Database Backup → Run workflow`）。

## 备份内容与覆盖范围

- ✅ Postgres 数据（`public` 业务表 + `auth` 用户 + `storage` 元数据），pg_dump custom 格式，`--no-owner --no-privileges`
- ❌ Supabase Storage `files` bucket 里的对象文件**不在备份内**，需要另配 rclone 同步（见"注意事项"）
- ❌ Cloudflare R2 对象本身不需要备（R2 是存储目标）

## 一、创建 R2 bucket 和 API Token（一次性，约 5 分钟）

1. Cloudflare Dashboard → **R2** → **Create bucket**，名称建议 `practice-web-backups`（bucket 默认就是私有的）
2. R2 → **Manage R2 API Tokens** → **Create API Token**：
   - Permission：**Object Read & Write**
   - Scope：只勾选上面那个 bucket（最小权限）
3. 记下三个值（后面要填进 GitHub Secrets）：
   - **Account ID**（Dashboard 首页/右侧栏可看到）
   - **Access Key ID**
   - **Secret Access Key**（只显示一次，注意保存）

## 二、填 GitHub Secrets（Settings → Secrets and variables → Actions）

| Secret | 说明 |
|---|---|
| `SUPABASE_DB_URL` | Supabase Dashboard → **Connect** → **Session pooler** 连接串（形如 `postgresql://postgres.xxx:密码@aws-0-<region>.pooler.supabase.com:5432/postgres`）。**不要用** Transaction pooler（6543） |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | 上面创建的 R2 token |
| `R2_SECRET_ACCESS_KEY` | 上面创建的 R2 token |
| `BACKUP_ENCRYPTION_PASSPHRASE` | 可选。设置后备份会 AES-256 加密，恢复时必须提供同一个值 |
| `ALERT_WEBHOOK_URL` | 可选。飞书自定义机器人 webhook，备份失败时推送 |

可选 Variables（默认值见右）：

| Variable | 默认 |
|---|---|
| `R2_BUCKET` | `practice-web-backup` |
| `R2_PREFIX` | `supabase` |
| `BACKUP_RETENTION_DAYS` | `30` |

## 三、测试

1. GitHub → **Actions** → **Database Backup** → **Run workflow**（手动触发一次）
2. 跑完后去 R2 bucket 确认出现 `supabase/practice-web-<时间戳>.dump(.enc)` 和对应的 `.sha256`
3. 确认无误后无需再动，之后的每天 02:20 UTC 自动执行

## 四、恢复

```bash
# 恢复到最新一份备份（本地/临时实例）
RESTORE_TARGET_URL="postgresql://..." \
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
BACKUP_ENCRYPTION_PASSPHRASE=... \
bash scripts/backup/restore.sh latest

# 恢复到指定备份
bash scripts/backup/restore.sh supabase/practice-web-20250401T020000Z.dump
```

⚠️ **永远不要把 `RESTORE_TARGET_URL` 指向生产库**。先恢复到新实例验证数据，再切换。只恢复 `public` schema：

```bash
pg_restore --clean --if-exists --no-owner -n public -d "$TARGET" backup.dump
```

## 五、加固（可选）

用只读角色代替 postgres 主账号做备份：在 Supabase SQL Editor 里执行 `readonly_role.sql`（先改密码），然后把 `SUPABASE_DB_URL` 换成该角色的连接串。

## 六、注意事项

- **Storage 对象**：`files` bucket 的内容不在本备份内。如需覆盖，另加一条 rclone 任务把 `files` bucket 同步到 R2/其他存储（例如 `rclone copy supabase-files: s3-backup:files-backup/`）
- 托管 Supabase 自带每日备份（Pro 起）和可选 PITR，本方案是**离线兜底**，两者不冲突；Free 计划没有托管备份，本方案是唯一备份，请务必配置
- 建议每季度做一次恢复演练（流程见"四、恢复"），验证备份真实可恢复
- 时间/保留期/前缀都可通过 Variables 调整

中文 | [English](README.md)

<br/>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Practice-Web-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjMiLz48cGF0aCBkPSJNNiAxMGg0djZIOHoiLz48cGF0aCBkPSJNOSA2djQiLz48cGF0aCBkPSJNMTQgN2g0djVoLTJ6Ii8+PHBhdGggZD0iTTE2IDEwdjEiLz48L3N2Zz4="/>
    <img alt="Practice Web" src="https://img.shields.io/badge/Practice-Web-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjMiLz48cGF0aCBkPSJNNiAxMGg0djZIOHoiLz48cGF0aCBkPSJNOSA2djQiLz48cGF0aCBkPSJNMTQgN2g0djVoLTJ6Ii8+PHBhdGggZD0iTTE2IDEwdjEiLz48L3N2Zz4="/>
  </picture>
</p>

<p align="center">
  <a href="https://github.com/rand777gg/practice-web/releases"><img src="https://img.shields.io/github/v/release/rand777gg/practice-web?color=blue" alt="Release"></a>
  <a href="https://github.com/rand777gg/practice-web/actions"><img src="https://img.shields.io/github/actions/workflow/status/rand777gg/practice-web/ci.yml?branch=master" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-~6.0-3178C6?logo=typescript" alt="TypeScript">
</p>

# 刷题网站

基于 React + Supabase 的 AI 全题型刷题平台。支持多题型练习、考试与编程题判题、学习路线、自习室、试卷模板与预约考试，配备 ECharts 仪表盘分析、双学习计划、题库管理、扫码登录、2FA 安全认证与完整 PWA 离线支持，内置中英文。

## 亮点

- **仪表盘分析** — ECharts 图表：每日热力图、时间分布、堆叠柱状图、散点图、正确率柱状图、热力图、矩阵树图、旭日图、桑基图、嵌套环形图、艾宾浩斯曲线、紧急度图
- **AI 驱动** — 题目智能解析、知识点一键生成、每日学习总结、艾宾浩斯遗忘曲线学习计划、智能出题配置、AI 图表洞察
- **双学习计划** — 长期计划（学科 + 截止日期 → 每日目标）+ 自定义每日目标，学科进度条追踪
- **题库** — 精选题目合集，支持详情查看和会话选题，练习/考试/学习路线均可使用
- **顺序刷题** — 按知识点分科分组，跨设备进度同步，知识点批量会话管理
- **学习路线** — 管理员按阶段编排的精选题集路线，逐题通过统计，draw.io 路线图（管理员可内嵌编辑并存库；archify 阶段着色图作为「开发中」标签页保留）
- **编程判题** — LeetCode 风格双栏 IDE，平台中心判题 + 本地 Judge0 离线自测双通道
- **试卷模板与预约考试** — 所见即所得组卷、多视图预览、定时到点 Web Push/邮件提醒
- **自习室** — 邀请码加入、每日打卡、打卡与考试邮件提醒
- **2FA 安全认证** — TOTP 验证器 + Passkey（WebAuthn）+ 恢复码，会话/设备级免验证、可信设备管理、飞书登录通知
- **跨设备同步** — 双向设置同步与冲突检测（侧边栏折叠、主题、语言、顺序刷题进度）
- **扫码登录** — 桌面端二维码 → 手机扫码 → 即时登录，无需输入密码
- **移动端适配** — iOS 风格底部导航栏、滑动切题、可折叠侧边栏、图表自适应
- **PWA** — Service Worker 离线缓存，手机和桌面端均可安装
- **深色 + 护眼模式** — 跟随系统深色模式，六种中国传统配色主题
- **中英文** — 内置语言切换（设置页 / 新用户引导页）

## 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | React 19、TypeScript、Vite 8 |
| UI | Tailwind CSS 4、shadcn/ui、Radix UI、Lucide、Motion |
| 图表 | ECharts 6、Recharts、Mermaid |
| 状态管理 | Zustand |
| 路由 | React Router v7（懒加载） |
| 后端 | Supabase（PostgreSQL、Auth、RLS、Edge Functions） |
| AI | Vercel AI SDK + DeepSeek / OpenAI |
| Markdown | react-markdown、Shiki、remark-math、rehype-raw |
| 认证 | @simplewebauthn/browser、otplib、qrcode |
| 判题 | Judge0（平台中心 / 本地自测双通道） |
| 国际化 | 内置中英文切换 |
| PWA | vite-plugin-pwa + Workbox |

## 快速开始

### 前置条件

- Node.js 18+
- [Supabase](https://supabase.com) 项目

### 初始化

```bash
git clone https://github.com/rand777gg/practice-web.git
cd practice-web
npm install
cp .env.example .env
```

编辑 `.env`：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

初始化数据库：打开 Supabase 项目 → **SQL Editor**，粘贴并执行 `supabase/migrations/001_initial_schema.sql`。

```bash
npm run dev
```

访问 `http://localhost:5173`，注册账号 — 首位用户自动成为管理员。注册启用邮箱确认时，需先点击邮件中的验证链接（发件人见 Supabase SMTP 配置，默认可自定义为 `register@mail.pguide.dev`），确认后进入新用户引导。

### 本地判题（Judge0，可选）

编程/算法题默认走平台中心判题。若想在高峰期用**自己电脑**跑判题（结果仅供个人练习、不计成绩），需要在一台 **VirtualBox 的 Ubuntu 22.04**（cgroup v1）上跑 Judge0——Windows 的 Docker Desktop / WSL2 只有 cgroup v2，运行不了 Judge0 的 isolate 沙箱（提交恒报 status 13）。

简要步骤：VirtualBox 装 Ubuntu 22.04 → NAT 端口转发（主机 2358 → 客户机 2358）→ GRUB 加 `systemd.unified_cgroup_hierarchy=0` 后重启 → `apt install docker.io docker-compose-v2` → 在 `judge0/` 目录 `docker compose up -d` → 应用侧边栏「本地判题」变绿，即可在编程题里开「本地自测」。

> 新手请看 [docs/judge0-local-setup.md](docs/judge0-local-setup.md)（VirtualBox Ubuntu 22.04 → cgroup v1 → 一条命令，全程零基础）。

## 功能

### 练习

| 功能 | 说明 |
|---|---|
| 题目范围 | 全部 / 仅收藏 / 仅错题 |
| 选题模式 | 混合 / 新题优先 / 错题优先 / 顺序刷题 |
| 多维筛选 | 学科、分类、题型、知识点 |
| 顺序模式 | 知识点分科分组、目录导航、排除/恢复题目、进度自动保存（断点续刷提示）、跨设备同步 |
| 学习路线 | 管理员编排的分阶段精选题集，自由刷题 + 通过统计，draw.io 路线图（可编辑存库）+ archify 着色图（开发中） |
| 学科解析 | 管理员维护的学科 Markdown 解析说明，练习时随题展示 |
| 滑动切题 | 触屏左右滑动切换题目 |
| 快捷键 | 上一题/下一题、收藏、太简单、标记存疑等键盘操作 |
| 笔记 | 富文本笔记，公开/私有切换 |
| 题库 | 精选合集管理，详情查看，练习/考试选题器 |

### 考试

| 功能 | 说明 |
|---|---|
| 灵活配置 | 题数、时长、学科/分类/题型筛选 |
| 试卷模板 | 所见即所得自定义封面/正文、页边距拖拽、模板画布组卷 |
| 预约考试 | 设定发送时间与考试时段，到点 Web Push / 邮件提醒 |
| 题目导航 | 网格视图，已答/未答一目了然 |
| 断点续考 | 自动检测未完成会话 |
| 超时提交 | 倒计时结束自动交卷 |
| 成绩报告 | ECharts 仪表盘 + 环形图 + 柱状图，多视图查看 |
| 历史记录 | 历次考试记录与成绩回顾、模板复用 |

### 编程判题

| 功能 | 说明 |
|---|---|
| 双栏 IDE | LeetCode 风格题目 + 代码编辑（CodeMirror），支持 Python/JS/TS/C/C++/Java |
| 用例运行 | 示例用例 / 自定义输入即时运行，逐用例判定着色 |
| 双通道判题 | 平台中心 Judge0 计成绩；本地 Judge0 自测不计成绩 |
| 提交记录 | 每次提交的语言、状态、耗时与历史列表 |

### AI

| 功能 | 说明 |
|---|---|
| 文档导入 | 上传 PDF/Word/图片 → OCR + LLM 自动提取题目（轻量解析 / MinerU 精准解析） |
| 解析历史 | 解析历史分页浏览、翻页加载，可编辑已解析题目、一键重新解析 |
| 知识点生成 | 一键生成知识点，动画逐字展示 |
| 学习总结 | 好友式对话总结，打字机逐行动画 |
| 智能出题 | 分析练习历史，推荐考试配置 |
| 学习计划 | 艾宾浩斯遗忘曲线 + 学科紧急度评分 |
| 图表洞察 | AI 根据仪表盘数据生成自然语言分析报告 |

### 自习室与提醒

| 功能 | 说明 |
|---|---|
| 自习室 | 邀请码加入 / 退出，成员在线状态与每日打卡 |
| 提醒 | 自习打卡邮件提醒；预约考试到点 Web Push + 邮件提醒（可配置收件时间） |

### 仪表盘

- **每日热力图** — 学习活跃度概览
- **时间分布图** — 七环同心圆 × 24 小时
- **每日堆叠柱状图** — 按学科拆分，正确/错误分色
- **时间散点图** — 今日答题时刻气泡
- **正确率柱状图 + 热力图** — 学科正确率 + 学科×题型矩阵
- **旭日图** — 学科 → 分类 → 知识点层级
- **环形图 + 矩阵树图** — 嵌套层级，中国传统配色
- **桑基流向图** — 学科 ↔ 分类流向
- **艾宾浩斯曲线** — 遗忘曲线与复习计划
- **紧急度图** — 学科紧急度评分，辅助学习优先级

### 管理后台（管理员）

- 题目：完整 CRUD、动态选项、批量导入（CSV/JSON/AI 解析）、批量编辑/删除/验证、按学科/分类/题型/来源筛选
- 题目查重：相似题分组扫描，保留其一或整组操作
- 编程题：本地判题测试页（Judge0 直连自测）
- AI 导入：解析历史管理、PDF/图片扫描入库
- 用户管理：角色切换（管理员/普通用户）、**删除账号（级联清理全部关联数据）**、**邮箱确认状态列**、在线/最近在线展示
- 学习路线：分阶段编排、题库挂载、发布控制、内嵌 draw.io 路线图编辑（按阶段一键生成 / 存库 / 导出 .drawio）

### 账户与安全

- 注册流程：邮箱注册 + 邮箱确认验证邮件（支持自定义 SMTP / 中英双语模板）+ GitHub OAuth 登录
- 新用户引导（/guide）：欢迎 → 推荐 Passkey / 认证器 App → 开始使用，管理员强制设置 2FA
- 二维码扫码登录（轮询确认）
- TOTP 二次验证：认证器 App 绑定；**更换认证器需先验证当前验证码或恢复码**，防静默换绑
- Passkey（WebAuthn）二次验证，平台原生生物识别
- 2FA 恢复码：设置时生成一组一次性恢复码（SHA-256 哈希存储）
- MFA 有效期：会话级免验证（登录即免 / 7 / 14 / 30 天），支持可信设备管理（命名、信任期限、远程撤销）
- 邮箱确认注册 + 登录通知（飞书机器人）
- 账号注销：级联删除，支持 OAuth 身份解绑
- 全表行级安全策略（RLS）+ 管理员 / 普通用户角色分离，首位注册用户自动成为管理员

## 路由表

| 路径 | 页面 | 权限 |
|---|---|---|
| `/login` | 登录 | 公开 |
| `/register` | 注册 | 公开 |
| `/guide` | 新用户引导（Onboarding） | 登录后按需跳转 |
| `/mfa`、`/mfa/:method` | MFA 验证页（passkey / app / recovery） | 登录后按需跳转 |
| `/welcome` | 欢迎页（邮箱验证成功落地） | 公开 |
| `/farewell` | 账号已注销 | 公开 |
| `/terms`、`/privacy` | 服务条款 / 隐私政策 | 公开 |
| `/qr-confirm` | 扫码确认 | 公开 |
| `/` | 门户首页（未登录）/ 仪表盘（已登录） | 公开 / 需登录 |
| `/practice` | 练习 | 需登录 |
| `/exam` | 考试 | 需登录 |
| `/exam/templates` | 试卷模板与预约考试 | 需登录 |
| `/exam/result/:sessionId` | 考试成绩 | 需登录 |
| `/favorites` | 收藏 | 需登录 |
| `/review` | 错题回顾 | 需登录 |
| `/notes` | 公开笔记 | 需登录 |
| `/question-bank` | 题库 | 需登录 |
| `/learning-routes` | 学习路线列表 | 需登录 |
| `/learning-routes/:routeId` | 学习路线详情（阶段 + draw.io / archify 路线图） | 需登录 |
| `/learning-routes/:routeId/practice` | 路线练习 | 需登录 |
| `/study-rooms` | 自习室 | 需登录 |
| `/settings` | 设置 | 需登录 |
| `/judge-local` | 本地判题（Judge0）设置指南 | 需登录 |
| `/admin/questions` | 题目列表 | 管理员 |
| `/admin/questions/new` | 新建题目 | 管理员 |
| `/admin/questions/:questionId/edit` | 编辑题目 | 管理员 |
| `/admin/questions/test` | 编程题本地判题测试 | 管理员 |
| `/admin/duplicates` | 题目查重 | 管理员 |
| `/admin/users` | 用户管理（角色、删除、邮箱确认） | 管理员 |
| `/admin/ai` | AI 配置 | 管理员 |
| `/admin/ai-import` | AI 导入 | 管理员 |
| `/admin/learning-routes` | 学习路线管理 | 管理员 |
| `/admin/learning-routes/new` | 新建学习路线 | 管理员 |
| `/admin/learning-routes/:routeId/edit` | 编辑学习路线 | 管理员 |

## 项目结构

```
src/
├── components/
│   ├── ui/           shadcn 基础组件
│   ├── auth/         登录/注册、扫码器、2FA/Passkey 弹窗、MFA 面板、路由守卫
│   ├── layout/       应用布局、侧边栏、顶栏、学习计划组件
│   ├── ai/           AI 总结弹窗
│   ├── ai-import/    AI 导入向导、PDF 查看器、解析历史
│   ├── charts/       ECharts 与 Recharts 图表
│   ├── markdown/     Markdown 编辑器与渲染器（Shiki 语法高亮）
│   ├── notes/        笔记编辑器、表情选择器、格式工具栏
│   ├── practice/     练习会话、知识点选择器、编程题 IDE
│   ├── exam/         考试会话、计时器、导航器、成绩单、模板编辑、编排面板
│   ├── question-bank/ 题库卡片、详情、弹窗、选题器
│   ├── study-room/    自习室相关
│   ├── settings/      设置项（同步、快捷键等）
│   └── questions/    题目卡片、表单、列表、导入弹窗
├── hooks/            自定义 Hook
├── i18n/             中英文翻译
├── lib/              Supabase 客户端、AI SDK、MFA/Passkey 封装、工具函数
├── pages/            路由级页面组件
├── router/           懒加载路由定义
├── stores/           Zustand 状态管理
└── types/            TypeScript 类型定义
supabase/
├── migrations/       数据库迁移（单文件 001_initial_schema.sql，按 Section 追加）
└── functions/        Edge Functions（verify-totp、manage-passkey、qr-login、admin-delete-user、
                      delete-account、unlink-identity、login-notify、cloudflare-turnstile、
                      judge、study-room、notify-exam、parse-paper-cover、mineru-proxy、r2-*）
```

## 命令

```bash
npm run dev       # 启动开发服务器
npm run build     # TypeScript 检查 + 生产构建
npm run preview   # 本地预览生产构建
```

## 部署

构建项目，将 `dist/` 部署到任意静态托管服务（Vercel、Netlify、Cloudflare Pages 等）：

```bash
npm run build
```

在托管平台设置环境变量 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。

Edge Functions 部署（可选）：`npx supabase functions deploy <name> --project-ref <ref>`；数据库迁移：合并维护于 `supabase/migrations/001_initial_schema.sql`，远程执行可用 `npx supabase db query --linked "<sql>"`。

## CI / CD

| Workflow | 说明 |
|---|---|
| `build-check.yml` | 构建成功/失败飞书通知 |
| `pr-review.yml` | 自动 PR 审查（DeepSeek + 飞书通知） |
| `db-backup.yml` | 每日 Supabase 数据库备份到 Cloudflare R2（加密、保留 30 天）— 配置见 [`scripts/backup/README.md`](scripts/backup/README.md) |

### PR Review 设置

在仓库 **Settings → Secrets → Actions** 中配置：

| Secret | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com) |
| `FEISHU_WEBHOOK_URL` | 飞书机器人 Webhook 地址 |

飞书机器人安全设置：若启用了自定义关键词校验，需包含 `Build`（`build-check.yml` 用）与 `PR Review`（`pr-review.yml` 用），否则通知会被飞书拦截。

## 开源协议

[MIT](LICENSE)

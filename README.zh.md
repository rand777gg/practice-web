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

基于 React + Supabase 的 AI 全题型刷题平台。支持六种题型的练习与考试模式，配备 ECharts 仪表盘分析、双学习计划系统、题库管理、知识点顺序刷题、扫码登录、2FA 安全认证，完整 PWA 离线支持。

## 亮点

- **仪表盘分析** — ECharts 图表：每日热力图、时间分布、堆叠柱状图、散点图、正确率柱状图、热力图、矩阵树图、旭日图、桑基图、嵌套环形图、艾宾浩斯曲线、紧急度图
- **AI 驱动** — 题目智能解析、知识点一键生成、每日学习总结、艾宾浩斯遗忘曲线学习计划、智能出题配置、AI 图表洞察
- **双学习计划** — 长期计划（学科 + 截止日期 → 每日目标）+ 自定义每日目标，学科进度条追踪
- **题库** — 精选题目合集，支持详情查看和会话选题，练习/考试均可使用
- **顺序刷题** — 按知识点分科分组，跨设备进度同步，知识点批量会话管理
- **2FA 安全认证** — TOTP 验证器 + Passkey（WebAuthn），可信设备管理，飞书登录通知
- **跨设备同步** — 双向设置同步与冲突检测（侧边栏折叠、主题、语言、顺序刷题进度）
- **扫码登录** — 桌面端二维码 → 手机扫码 → 即时登录，无需输入密码
- **移动端适配** — iOS 风格底部导航栏、滑动切题、可折叠侧边栏、图表自适应
- **PWA** — Service Worker 离线缓存，手机和桌面端均可安装
- **深色 + 护眼模式** — 跟随系统深色模式，六种中国传统配色主题

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
| 认证 | @simplewebauthn/browser、otplib、qrcode、FingerprintJS |
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

访问 `http://localhost:5173`，注册账号 — 首位用户自动成为管理员。

## 功能

### 练习

| 功能 | 说明 |
|---|---|
| 题目范围 | 全部 / 仅收藏 / 仅错题 |
| 选题模式 | 混合 / 新题优先 / 错题优先 / 顺序刷题 |
| 多维筛选 | 学科、分类、题型、知识点 |
| 顺序模式 | 知识点分科分组、目录导航、排除/恢复题目、进度自动保存（断点续刷提示）、跨设备同步 |
| 学科解析 | 管理员维护的学科 Markdown 解析说明，练习时随题展示 |
| 滑动切题 | 触屏左右滑动切换题目 |
| 笔记 | 富文本笔记，公开/私有切换 |
| 题库 | 精选合集管理，详情查看，练习/考试选题器 |

### 考试

| 功能 | 说明 |
|---|---|
| 灵活配置 | 题数、时长、学科/分类/题型筛选 |
| 题目导航 | 网格视图，已答/未答一目了然 |
| 断点续考 | 自动检测未完成会话 |
| 超时提交 | 倒计时结束自动交卷 |
| 成绩报告 | ECharts 仪表盘 + 环形图 + 柱状图 |
| 历史记录 | 历次考试记录与成绩回顾 |

### AI

| 功能 | 说明 |
|---|---|
| 文档导入 | 上传 PDF/Word/图片 → OCR + LLM 自动提取题目（轻量解析 / MinerU 精准解析） |
| 解析历史 | 解析历史分页浏览，可编辑已解析题目、一键重新解析 |
| 知识点生成 | 一键生成知识点，动画逐字展示 |
| 学习总结 | 好友式对话总结，打字机逐行动画 |
| 智能出题 | 分析练习历史，推荐考试配置 |
| 学习计划 | 艾宾浩斯遗忘曲线 + 学科紧急度评分 |
| 图表洞察 | AI 根据仪表盘数据生成自然语言分析报告 |

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

### 题目管理（管理员）

- 完整 CRUD，动态选项数量
- 批量导入：CSV、JSON、AI 文档解析
- 按学科/分类/题型/导入模式/验证状态筛选
- 批量编辑、删除、验证切换

### 账户与安全

- 邮箱 + GitHub OAuth 登录
- 二维码扫码登录（轮询确认）
- TOTP 二次验证，支持 Authenticator 应用绑定
- Passkey（WebAuthn）二次验证，平台原生生物识别
- 可信设备管理 — 设备命名、信任期限、远程撤销
- 飞书机器人登录通知
- 账号注销，支持 OAuth 身份解绑
- 全表行级安全策略（RLS）
- 管理员 / 普通用户角色分离
- 首位注册用户自动成为管理员

## 路由表

| 路径 | 页面 | 权限 |
|---|---|---|
| `/login` | 登录 | 公开 |
| `/register` | 注册 | 公开 |
| `/welcome` | 欢迎页 | 公开 |
| `/farewell` | 账号已注销 | 公开 |
| `/terms` | 服务条款 | 公开 |
| `/privacy` | 隐私政策 | 公开 |
| `/qr-confirm` | 扫码确认 | 公开 |
| `/` | 仪表盘 | 需登录 |
| `/practice` | 练习 | 需登录 |
| `/exam` | 考试 | 需登录 |
| `/exam/result/:sessionId` | 考试成绩 | 需登录 |
| `/favorites` | 收藏 | 需登录 |
| `/notes` | 公开笔记 | 需登录 |
| `/review` | 错题回顾 | 需登录 |
| `/question-bank` | 题库 | 需登录 |
| `/settings` | 设置 | 需登录 |
| `/admin/questions` | 题目列表 | 管理员 |
| `/admin/questions/new` | 新建题目 | 管理员 |
| `/admin/questions/:questionId/edit` | 编辑题目 | 管理员 |
| `/admin/users` | 用户管理 | 管理员 |
| `/admin/ai` | AI 配置 | 管理员 |
| `/admin/ai-import` | AI 导入 | 管理员 |

## 项目结构

```
src/
├── components/
│   ├── ui/           shadcn 基础组件
│   ├── auth/         登录/注册表单、扫码器、2FA 弹窗、路由守卫
│   ├── layout/       应用布局、侧边栏、顶栏、学习计划组件
│   ├── ai/           AI 总结弹窗
│   ├── ai-import/    AI 导入向导、PDF 查看器、解析历史
│   ├── charts/       ECharts 与 Recharts 图表
│   ├── markdown/     Markdown 编辑器与渲染器（Shiki 语法高亮）
│   ├── notes/        笔记编辑器、表情选择器、格式工具栏
│   ├── practice/     练习会话、知识点选择器
│   ├── exam/         考试会话、计时器、导航器、成绩单、历史记录
│   ├── question-bank/ 题库卡片、详情、弹窗、选题器
│   └── questions/    题目卡片、表单、列表、导入弹窗
├── hooks/            自定义 Hook
├── i18n/             中英文翻译
├── lib/              Supabase 客户端、AI SDK、工具函数
├── pages/            路由级页面组件
├── router/           懒加载路由定义
├── stores/           Zustand 状态管理
└── types/            TypeScript 类型定义
supabase/
├── migrations/       数据库迁移（单文件）
└── functions/        Edge Functions（qr-login、verify-totp、manage-passkey、login-notify、delete-account、unlink-identity、r2-*、mineru-proxy）
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
